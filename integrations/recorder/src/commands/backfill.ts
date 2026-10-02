import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Agent, CommitFinder, DirNameResolver, GitRunner, RecorderEvent } from "../core/types"
import { backfillClaudeCode as backfillClaudeCodeDefault, type BackfillOptions, type BackfillStats } from "../agents/claude-code-backfill"
import { backfillCodex as backfillCodexDefault } from "../agents/codex-backfill"
import { createCommitFinder } from "../git/commits"
import { createDirNameResolver } from "../git/resolve-project"
import { createGitRunner } from "../git/runner"
import { appendEvent as appendEventDefault, readEvents as readEventsDefault } from "../store/event-log"
import { readState as readStateDefault } from "../store/state"
import { recorderHome } from "../store/paths"
import { isPromptTextAllowed } from "../store/privacy"

const DAY_MS = 24 * 60 * 60 * 1000

export interface BackfillOptionsInput {
  agent: Agent | "all"
  days: number
  dryRun: boolean
}

export interface BackfillDependencies {
  env: Record<string, string | undefined>
  home?: string
  now?: number
  resolveDir?: DirNameResolver
  findCommits?: CommitFinder
  pathExists?(path: string): Promise<boolean>
  git?: GitRunner
  readEvents?(home: string, options: { now?: number }): RecorderEvent[]
  appendEvent?(home: string, event: RecorderEvent): void
  readFirstLive?(home: string): Partial<Record<Agent, number>>
  backfillClaudeCode?(options: BackfillOptions, stats: BackfillStats): AsyncGenerator<RecorderEvent>
  backfillCodex?(options: BackfillOptions, stats: BackfillStats): AsyncGenerator<RecorderEvent>
}

interface AgentStats {
  files: number
  sessions: number
  events: number
  skippedFiles: number
}

function emptyStats(): AgentStats {
  return { files: 0, sessions: 0, events: 0, skippedFiles: 0 }
}

function withoutPromptText(event: Extract<RecorderEvent, { kind: "prompt" }>): Extract<RecorderEvent, { kind: "prompt" }> {
  const safe = { ...event }
  delete safe.text
  return safe
}

function eventIdentity(event: RecorderEvent): string {
  return `${event.session}|${event.kind}|${event.t}`
}

function defaultResolveFirstLive(home: string): Partial<Record<Agent, number>> {
  return readStateDefault(home).firstLiveEvent
}

export async function runBackfill(options: BackfillOptionsInput, dependencies: BackfillDependencies): Promise<string> {
  if (!Number.isSafeInteger(options.days) || options.days < 1) throw new Error("--days 必须是正整数")
  const now = dependencies.now ?? Date.now()
  const home = dependencies.home ?? recorderHome(dependencies.env)
  const since = now - options.days * DAY_MS
  const firstLive = (dependencies.readFirstLive ?? defaultResolveFirstLive)(home)
  const git = dependencies.git ?? createGitRunner()
  const resolveDir = dependencies.resolveDir ?? createDirNameResolver(git, dependencies.pathExists ?? (async (path) => existsSync(path)))
  const findCommits = dependencies.findCommits ?? createCommitFinder(git)
  const env = dependencies.env
  const promptTextAllowed = isPromptTextAllowed(home, env)
  const selected: Agent[] = options.agent === "all" ? ["claude-code", "codex"] : [options.agent]
  const existing = (dependencies.readEvents ?? readEventsDefault)(home, { now })
  const identities = new Set(existing.map(eventIdentity))
  const reports: string[] = []

  for (const agent of selected) {
    const stats = emptyStats()
    const agentOptions: BackfillOptions = {
      root: agent === "claude-code"
        ? join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects")
        : join(env.CODEX_HOME || join(homedir(), ".codex"), "sessions"),
      since,
      until: firstLive[agent] ?? Number.POSITIVE_INFINITY,
      resolveDir,
      findCommits,
    }
    const generate = agent === "claude-code"
      ? dependencies.backfillClaudeCode ?? backfillClaudeCodeDefault
      : dependencies.backfillCodex ?? backfillCodexDefault
    let added = 0
    const pendingEvents: RecorderEvent[] = []
    for await (const event of generate(agentOptions, stats)) {
      const storedEvent = event.kind === "prompt" && !promptTextAllowed ? withoutPromptText(event) : event
      const identity = eventIdentity(storedEvent)
      if (identities.has(identity)) continue
      identities.add(identity)
      added += 1
      pendingEvents.push(storedEvent)
    }
    if (!options.dryRun) {
      for (const event of pendingEvents) (dependencies.appendEvent ?? appendEventDefault)(home, event)
    }
    reports.push(`${agent}：文件 ${stats.files}，会话 ${stats.sessions}，事件 ${added}${stats.skippedFiles ? `，跳过文件 ${stats.skippedFiles}` : ""}`)
  }
  const heading = options.dryRun ? "回填预览" : "回填完成"
  return `${heading}\n${reports.join("\n")}\n运行 deverdesk-recorder sync 上传已绑定目录的记录。`
}
