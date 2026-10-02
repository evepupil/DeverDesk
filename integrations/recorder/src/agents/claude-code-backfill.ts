import { readdir } from "node:fs/promises"
import { join } from "node:path"
import type { CommitFinder, DirNameResolver, RecorderEvent } from "../core/types"
import { firstBackfillSentence, isRecord, readJsonlLines, commitsBySession, type BackfillSession } from "./backfill-common"

export interface BackfillOptions {
  /** 会话记录根目录，默认 $CLAUDE_CONFIG_DIR/projects 或 ~/.claude/projects */
  root: string
  /** 只回填这个时间之后的事件（毫秒） */
  since: number
  /** 只回填这个时间之前的事件（毫秒）；一般是「该 agent 第一个实时事件」的时间 */
  until: number
  resolveDir: DirNameResolver
  findCommits: CommitFinder
}

export interface BackfillStats {
  files: number
  sessions: number
  events: number
  skippedFiles: number
}

interface ClaudeRow {
  session: string
  cwd?: string
  timestamp?: number
  promptText?: string
  stopKey?: string
  isStop: boolean
}

function parseClaudeRow(line: string): ClaudeRow | undefined {
  if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) return undefined
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!isRecord(value) || typeof value.sessionId !== "string" || !value.sessionId) return undefined
  if (value.forkedFrom || value.isCompactSummary === true) return undefined

  const timestamp = typeof value.timestamp === "string" ? Date.parse(value.timestamp) : Number.NaN
  const message = isRecord(value.message) ? value.message : undefined
  let promptText: string | undefined
  if (value.type === "user" && value.isMeta !== true && value.isSidechain !== true && message) {
    const content = message.content
    if (typeof content === "string") {
      promptText = isHumanPrompt(value, content) ? content : undefined
    } else if (Array.isArray(content) && !content.some((part) => isRecord(part) && part.type === "tool_result")) {
      const text = content
        .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
        .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
        .join("")
      promptText = isHumanPrompt(value, text) ? text : undefined
    }
  }

  const isStop = value.type === "assistant" && value.isSidechain !== true && message?.stop_reason === "end_turn"
  const messageId = typeof message?.id === "string" && message.id ? message.id : undefined
  const requestId = typeof value.requestId === "string" && value.requestId ? value.requestId : undefined
  const stopKey = isStop
    ? messageId ? `message:${messageId}` : requestId ? `request:${requestId}` : undefined
    : undefined
  return {
    session: value.sessionId,
    cwd: typeof value.cwd === "string" ? value.cwd : undefined,
    timestamp: Number.isFinite(timestamp) ? timestamp : undefined,
    promptText,
    stopKey,
    isStop,
  }
}

function isHumanPrompt(row: Record<string, unknown>, text: string): boolean {
  if (Object.prototype.hasOwnProperty.call(row, "origin")) {
    return isRecord(row.origin) && row.origin.kind === "human"
  }
  return !text.startsWith("<") && !text.startsWith("[Request interrupted")
}

async function listClaudeFiles(root: string, stats: BackfillStats): Promise<string[]> {
  let projects
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch {
    stats.skippedFiles += 1
    return []
  }

  const files: string[] = []
  for (const project of projects) {
    if (!project.isDirectory()) continue
    let entries
    try {
      entries = await readdir(join(root, project.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(join(root, project.name, entry.name))
    }
  }
  return files.sort()
}

async function scanClaudeFile(filePath: string): Promise<Map<string, BackfillSession>> {
  const sessions = new Map<string, BackfillSession>()
  for await (const line of readJsonlLines(filePath)) {
    const row = parseClaudeRow(line)
    if (!row) continue
    const session = sessions.get(row.session) ?? { session: row.session, cwd: "", dir: "" }
    if (row.cwd !== undefined) {
      if (row.timestamp !== undefined && (session.cwdAt === undefined || row.timestamp < session.cwdAt)) {
        session.cwd = row.cwd
        session.cwdAt = row.timestamp
      } else if (row.timestamp === undefined && !session.cwd) {
        session.cwd = row.cwd
      }
    }
    if (row.timestamp !== undefined) {
      session.startAt = session.startAt === undefined ? row.timestamp : Math.min(session.startAt, row.timestamp)
      session.activityEndAt = session.activityEndAt === undefined ? row.timestamp : Math.max(session.activityEndAt, row.timestamp)
    }
    sessions.set(row.session, session)
  }
  return sessions
}

function mergeSession(target: Map<string, BackfillSession>, incoming: Map<string, BackfillSession>): void {
  for (const [id, next] of incoming) {
    const current = target.get(id)
    if (!current) {
      target.set(id, next)
      continue
    }
    if (next.cwdAt !== undefined && (current.cwdAt === undefined || next.cwdAt < current.cwdAt)) {
      current.cwd = next.cwd
      current.cwdAt = next.cwdAt
    } else if (next.cwdAt === undefined && !current.cwd) {
      current.cwd = next.cwd
    }
    if (next.startAt !== undefined) current.startAt = current.startAt === undefined ? next.startAt : Math.min(current.startAt, next.startAt)
    if (next.activityEndAt !== undefined) {
      current.activityEndAt = current.activityEndAt === undefined ? next.activityEndAt : Math.max(current.activityEndAt, next.activityEndAt)
    }
  }
}

/** 流式读取，逐个会话产出按时间排序的事件；单个文件出错只跳过该文件 */
export async function* backfillClaudeCode(options: BackfillOptions, stats: BackfillStats): AsyncGenerator<RecorderEvent> {
  const paths = await listClaudeFiles(options.root, stats)
  const readableFiles: string[] = []
  const summaries = new Map<string, BackfillSession>()
  for (const filePath of paths) {
    stats.files += 1
    try {
      mergeSession(summaries, await scanClaudeFile(filePath))
      readableFiles.push(filePath)
    } catch {
      stats.skippedFiles += 1
    }
  }
  stats.sessions += summaries.size

  const sessions: BackfillSession[] = []
  for (const session of summaries.values()) {
    if (!session.cwd) continue
    try {
      const resolved = await options.resolveDir(session.cwd)
      session.dir = resolved.dir
      session.repo = resolved.repo
      sessions.push(session)
    } catch {
      continue
    }
  }
  const sessionById = new Map(sessions.map((session) => [session.session, session]))
  const eventsBySession = new Map(sessions.map((session) => [session.session, [] as RecorderEvent[]]))
  const keyedStops = new Map<string, Map<string, number | undefined>>()

  for (const session of sessions) {
    if (session.startAt === undefined || session.startAt < options.since || session.startAt >= options.until) continue
    eventsBySession.get(session.session)?.push({ v: 1, t: session.startAt, agent: "claude-code", session: session.session, dir: session.dir, cwd: session.cwd, backfill: true, kind: "start", source: "backfill" })
  }

  for (const filePath of readableFiles) {
    try {
      for await (const line of readJsonlLines(filePath)) {
        const row = parseClaudeRow(line)
        if (!row) continue
        const session = sessionById.get(row.session)
        if (!session) continue
        const events = eventsBySession.get(session.session)
        if (!events) continue

        if (row.promptText !== undefined && row.timestamp !== undefined && row.timestamp >= options.since && row.timestamp < options.until) {
          events.push({ v: 1, t: row.timestamp, agent: "claude-code", session: session.session, dir: session.dir, cwd: session.cwd, backfill: true, kind: "prompt", text: firstBackfillSentence(row.promptText, 120) })
        }
        if (!row.isStop) continue
        if (row.stopKey) {
          const stops = keyedStops.get(session.session) ?? new Map<string, number | undefined>()
          stops.set(row.stopKey, row.timestamp)
          keyedStops.set(session.session, stops)
        } else if (row.timestamp !== undefined && row.timestamp >= options.since && row.timestamp < options.until) {
          events.push({ v: 1, t: row.timestamp, agent: "claude-code", session: session.session, dir: session.dir, cwd: session.cwd, backfill: true, kind: "stop" })
        }
      }
    } catch {
      stats.skippedFiles += 1
    }
  }

  for (const [sessionId, stops] of keyedStops) {
    const session = sessionById.get(sessionId)
    const events = eventsBySession.get(sessionId)
    if (!session || !events) continue
    for (const timestamp of stops.values()) {
      if (timestamp === undefined || timestamp < options.since || timestamp >= options.until) continue
      events.push({ v: 1, t: timestamp, agent: "claude-code", session: session.session, dir: session.dir, cwd: session.cwd, backfill: true, kind: "stop" })
    }
  }

  const commits = await commitsBySession(sessions, options.findCommits, options.since, options.until)
  const unassignedCommits: RecorderEvent[] = []
  for (const { commit, repo, session, dir, cwd } of commits) {
    const event: RecorderEvent = {
      v: 1,
      t: commit.committedAt,
      agent: "claude-code",
      session,
      dir,
      cwd,
      backfill: true,
      kind: "commit",
      repo,
      sha: commit.sha,
      subject: commit.subject,
      body: commit.body.slice(0, 500),
      additions: commit.additions,
      deletions: commit.deletions,
      files: commit.files,
      authoredAt: commit.authoredAt,
    }
    const events = session ? eventsBySession.get(session) : undefined
    if (events) events.push(event)
    else unassignedCommits.push(event)
  }

  for (const events of [...eventsBySession.values(), unassignedCommits]) {
    events.sort((left, right) => left.t - right.t)
    for (const event of events) {
      stats.events += 1
      yield event
    }
  }
}
