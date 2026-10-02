import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseClaudeCodeHook, type ParsedAgentHook } from "../agents/claude-code"
import { parseCodexHook } from "../agents/codex"
import { SETTLE_DELAY } from "../core/constants"
import type { Agent, CommitInfo, GitRunner, RecorderEvent } from "../core/types"
import { detectNewCommitsLocked } from "../git/commits"
import { createGitRunner } from "../git/runner"
import { resolveDirName } from "../git/resolve-project"
import { appendEvent } from "../store/event-log"
import { loadCredentials, type Credentials } from "../store/config"
import { isPromptTextAllowed } from "../store/privacy"
import { readState, updateState, type RecorderState } from "../store/state"
import { recorderHome } from "../store/paths"
import { fetchBriefing as requestBriefing, formatBriefing, type FetchBriefingOptions } from "../sync/briefing"
import { spawnBackgroundSync } from "../sync/spawn"
import type { BriefingResponse } from "../../../../src/sync/recorder-protocol"

const DAY_MS = 24 * 60 * 60_000
const SYNC_THROTTLE_MS = 60_000
const LOG_MAX_BYTES = 256 * 1024
const HOOK_EVENTS = new Set(["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd", "PostToolUse"])

export interface HookDependencies {
  home?: string
  git?: GitRunner
  resolveDir?: (cwd: string) => Promise<{ dir: string; repo?: string }>
  spawnSync?: (options?: { delayMs?: number }) => void
  fetchBriefing?: (credentials: Credentials, dir: string, options: FetchBriefingOptions) => Promise<BriefingResponse | null>
  log?: (home: string, message: string) => void
}

export interface HookInput {
  agent: Agent
  eventName: string
  input: unknown
  env: Record<string, string | undefined>
  now?: number
  deps?: HookDependencies
}

export interface HookResult {
  stdout?: string
}

/** 钩子只追加事件和启动后台工作；所有异常记录到本机日志并吞掉。 */
export async function runHook({ agent, eventName, input, env, now = Date.now(), deps = {} }: HookInput): Promise<HookResult> {
  const home = deps.home ?? recorderHome(env)
  const log = deps.log ?? appendRecorderLog
  const report = (message: string): void => {
    try {
      log(home, message)
    } catch {
      // 日志不可写时仍然不能影响宿主。
    }
  }

  try {
    if (env.DEVERDESK_RECORDER_INTERNAL === "1") return {}
    const payload = parseInput(input)
    const parsed = agent === "claude-code"
      ? parseClaudeCodeHook(eventName, payload, env)
      : parseCodexHook(eventName, payload)
    if (!parsed) {
      report(`Skipped ${agent} ${eventName}: missing required hook fields`)
      return {}
    }
    if (!HOOK_EVENTS.has(eventName)) {
      report(`Skipped ${agent} ${eventName}: unsupported hook event`)
      return {}
    }

    const referenceCwd = agent === "claude-code"
      ? env.CLAUDE_PROJECT_DIR?.trim() || parsed.cwd
      : parsed.cwd
    const initialState = readState(home)
    const cached = initialState.dirCache[referenceCwd]
    const resolved = cached && now - cached.at >= 0 && now - cached.at < DAY_MS
      ? { dir: cached.dir, repo: cached.repo }
      : await (deps.resolveDir ?? ((cwd) => resolveDirName(cwd, deps.git ?? createGitRunner())))(referenceCwd)
    const dir = resolved.dir
    const git = deps.git ?? createGitRunner()
    const events: RecorderEvent[] = []
    const addEvent = (event: RecorderEvent): void => {
      appendEvent(home, event)
      events.push(event)
    }
    const base = { v: 1 as const, t: now, agent, session: parsed.session, dir, cwd: parsed.cwd }
    const promptTextAllowed = isPromptTextAllowed(home, env)

    if (eventName === "SessionStart") {
      addEvent({ ...base, kind: "start", ...(parsed.source ? { source: parsed.source } : {}), ...(resolved.repo ? { repo: resolved.repo } : {}) })
    } else if (eventName === "UserPromptSubmit") {
      addEvent({ ...base, kind: "prompt", ...(promptTextAllowed && parsed.text ? { text: parsed.text } : {}) })
    } else if (eventName === "Stop") {
      addEvent({ ...base, kind: "stop", ...(promptTextAllowed && parsed.summary ? { summary: parsed.summary } : {}) })
    } else if (eventName === "SessionEnd") {
      addEvent({ ...base, kind: "end", ...(parsed.reason ? { reason: parsed.reason } : {}) })
    }

    let newCommits: CommitInfo[] = []
    if (shouldDiscoverCommits(eventName, parsed)) {
      const worktreeRoot = await findWorktreeRoot(git, referenceCwd)
      if (worktreeRoot) {
        const hasBaseline = initialState.repos[worktreeRoot] !== undefined
        const sessionStartMs = eventName === "SessionStart" || hasBaseline
          ? undefined
          : findSessionStart(initialState, agent, parsed.session) ?? now
        newCommits = await detectNewCommitsLocked(home, git, worktreeRoot, sessionStartMs, (commits) => {
          for (const commit of commits) addEvent(toCommitEvent(commit, base, resolved.repo ?? worktreeRoot, now))
        })
      }
    }

    await updateState(home, (state) => {
      const key = sessionStartKey(agent, parsed.session)
      if (!state.sessionStarts[key]) {
        state.sessionStarts[key] = { agent, session: parsed.session, at: now }
        trimSessionStarts(state.sessionStarts)
      }
      if (events.length > 0 && state.firstLiveEvent[agent] === undefined) {
        state.firstLiveEvent[agent] = events[0]?.t ?? now
      }
      state.lastHook = { at: now, agent, event: eventName, session: parsed.session }
      if (!cached || now - cached.at < 0 || now - cached.at >= DAY_MS) {
        state.dirCache[referenceCwd] = { dir, ...(resolved.repo ? { repo: resolved.repo } : {}), at: now }
      }
    })

    const currentState = readState(home)
    const spawnSync = deps.spawnSync ?? ((options: { delayMs?: number } = {}) => {
      spawnBackgroundSync(process.execPath, process.argv[1] ?? "", env, {
        ...options,
        onError: (error) => report(`Background sync spawn failed: ${error.message}`),
      })
    })
    // 延迟同步是个会睡十几分钟的后台进程。Windows 上有的宿主（例如经 PowerShell 管道调用 claude -p）会把输出管道
    // 传给它，宿主因此要等它睡完才认为命令结束；设 DEVERDESK_NO_DELAYED_SYNC=1 可以关掉，任务改为在下一次钩子触发时上传
    const spawnDelayed = (delayMs: number): void => {
      if (env.DEVERDESK_NO_DELAYED_SYNC === "1") return
      spawnSync({ delayMs })
    }
    if (eventName === "UserPromptSubmit") {
      if (!wasRecentlySynced(currentState.lastSync?.startedAt, now)) spawnSync()
    } else if (eventName === "Stop") {
      if (newCommits.length > 0 || !wasRecentlySynced(currentState.lastSync?.startedAt, now)) spawnSync()
      if (newCommits.length > 0) spawnDelayed(delayUntilCommitSettles(newCommits, now))
    } else if (eventName === "SessionEnd") {
      spawnSync()
      spawnDelayed(SETTLE_DELAY)
    } else if (eventName === "PostToolUse" && newCommits.length > 0) {
      spawnDelayed(delayUntilCommitSettles(newCommits, now))
    }

    if (eventName === "SessionStart") {
      const credentials = loadCredentials(home, env)
      if (credentials && isDirectoryBound(home, dir)) {
        const briefing = await (deps.fetchBriefing ?? ((creds, name, options) => requestBriefing(creds, name, options)))(
          credentials,
          dir,
          { timeoutMs: 800, home, now },
        )
        if (briefing) {
          const text = formatBriefing(briefing)
          if (text) return { stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }) }
        }
      }
    }
    return {}
  } catch (error) {
    report(errorMessage(error))
    return {}
  }
}

function parseInput(input: unknown): unknown {
  if (Buffer.isBuffer(input)) return JSON.parse(input.toString("utf8")) as unknown
  if (typeof input === "string") return JSON.parse(input) as unknown
  return input
}

function shouldDiscoverCommits(eventName: string, parsed: ParsedAgentHook): boolean {
  return eventName === "SessionStart" || eventName === "Stop" || eventName === "SessionEnd"
    || (eventName === "PostToolUse" && parsed.commitCommand === true)
}

async function findWorktreeRoot(git: GitRunner, cwd: string): Promise<string | undefined> {
  const result = await git.run(["-C", cwd, "rev-parse", "--show-toplevel"], cwd)
  if (!result.ok || !result.stdout.trim()) return undefined
  return result.stdout.trim().replace(/\\/g, "/").replace(/\/+$/, "")
}

function findSessionStart(state: RecorderState, agent: Agent, session: string): number | undefined {
  const cached = state.sessionStarts[sessionStartKey(agent, session)]
  return cached?.agent === agent && cached.session === session ? cached.at : undefined
}

function sessionStartKey(agent: Agent, session: string): string {
  return JSON.stringify([agent, session])
}

function trimSessionStarts(starts: RecorderState["sessionStarts"]): void {
  const entries = Object.entries(starts)
  if (entries.length <= 1000) return
  entries.sort((left, right) => left[1].at - right[1].at)
  for (const [key] of entries.slice(0, entries.length - 1000)) delete starts[key]
}

interface HookEventBase {
  v: 1
  t: number
  agent: Agent
  session: string
  dir: string
  cwd: string
}

function toCommitEvent(commit: CommitInfo, base: HookEventBase, repo: string, seenAt: number): RecorderEvent {
  return {
    ...base,
    t: commit.committedAt,
    seenAt,
    kind: "commit",
    repo,
    sha: commit.sha,
    subject: commit.subject,
    ...(commit.body ? { body: commit.body.slice(0, 500) } : {}),
    additions: commit.additions,
    deletions: commit.deletions,
    files: commit.files,
    authoredAt: commit.authoredAt,
  }
}

function delayUntilCommitSettles(commits: readonly CommitInfo[], now: number): number {
  const nextArrival = Math.min(...commits.map((commit) => commit.committedAt + SETTLE_DELAY))
  return Math.max(0, nextArrival - now)
}

function wasRecentlySynced(startedAt: number | undefined, now: number): boolean {
  return startedAt !== undefined && now - startedAt <= SYNC_THROTTLE_MS
}

function isDirectoryBound(home: string, dir: string): boolean {
  try {
    const value: unknown = JSON.parse(readFileSync(join(home, "bindings.json"), "utf8"))
    const bindings = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.bindings) ? value.bindings : []
    return bindings.some((item) => isRecord(item) && typeof item.dir === "string" && item.dir.toLowerCase() === dir.toLowerCase())
  } catch {
    return false
  }
}

export function appendRecorderLog(home: string, message: string): void {
  try {
    const directory = join(home, "logs")
    mkdirSync(directory, { recursive: true })
    const path = join(directory, "recorder.log")
    appendFileSync(path, `${new Date().toISOString()} ${message}\n`, "utf8")
    if (statSync(path).size <= LOG_MAX_BYTES) return
    const contents = readFileSync(path)
    writeFileSync(path, contents.subarray(contents.length - Math.floor(LOG_MAX_BYTES / 2)))
  } catch {
    // 钩子错误不能传播给 Claude Code 或 Codex。
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof SyntaxError) return "Invalid hook payload JSON"
  return error instanceof Error ? error.stack ?? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
