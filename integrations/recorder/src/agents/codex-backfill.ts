import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"
import type { RecorderEvent } from "../core/types"
import { commitsBySession, isRecord, readJsonlLines, type BackfillSession } from "./backfill-common"
import type { BackfillOptions, BackfillStats } from "./claude-code-backfill"

const DAY_MS = 24 * 60 * 60 * 1000

interface CodexRow {
  type: string
  timestamp?: number
  sessionId?: string
  cwd?: string
  eventType?: string
}

function parseCodexRow(line: string): CodexRow | undefined {
  if (!line.includes('"type":"session_meta"') && !line.includes('"type":"event_msg"')) return undefined
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!isRecord(value) || typeof value.type !== "string") return undefined
  const payload = isRecord(value.payload) ? value.payload : undefined
  const metadataId = payload?.id
  const aliasId = payload?.session_id
  const sessionId = typeof metadataId === "string" && metadataId.length > 0
    ? metadataId
    : typeof aliasId === "string" && aliasId.length > 0
      ? aliasId
      : undefined
  const timestamp = typeof value.timestamp === "string" ? Date.parse(value.timestamp) : Number.NaN
  return {
    type: value.type,
    timestamp: Number.isFinite(timestamp) ? timestamp : undefined,
    sessionId,
    cwd: typeof payload?.cwd === "string" ? payload.cwd : undefined,
    eventType: typeof payload?.type === "string" ? payload.type : undefined,
  }
}

function dateFromFilename(filePath: string): number | undefined {
  const match = /^rollout-(\d{4}-\d{2}-\d{2})/.exec(basename(filePath))
  if (!match?.[1]) return undefined
  const dateText = match[1]
  const date = Date.parse(`${dateText}T00:00:00.000Z`)
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== dateText) return undefined
  return date
}

function filenameSessionId(filePath: string): string | undefined {
  const match = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(basename(filePath))
  return match?.[1]
}

function olderThanSince(filePath: string, since: number): boolean {
  const fileDate = dateFromFilename(filePath)
  if (fileDate === undefined) return false
  const sinceDay = Math.floor(since / DAY_MS) * DAY_MS
  return fileDate < sinceDay - DAY_MS
}

async function listCodexFiles(root: string, stats: BackfillStats): Promise<string[]> {
  const files: string[] = []
  async function walk(directory: string, depth: number): Promise<void> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      if (depth === 0) stats.skippedFiles += 1
      return
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (depth < 3 && entry.isDirectory()) {
        await walk(path, depth + 1)
      } else if (depth === 3 && entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
        files.push(path)
      }
    }
  }
  await walk(root, 0)
  return files.sort()
}

async function scanCodexFile(filePath: string): Promise<BackfillSession> {
  const fallbackId = filenameSessionId(filePath)
  let sessionId: string | undefined
  let cwd: string | undefined
  let cwdAt: number | undefined
  let startAt: number | undefined
  let activityEndAt: number | undefined

  for await (const line of readJsonlLines(filePath)) {
    const row = parseCodexRow(line)
    if (!row) continue
    if (row.type === "session_meta" && row.sessionId) sessionId = row.sessionId
    if (row.cwd !== undefined) {
      if (row.timestamp !== undefined && (cwdAt === undefined || row.timestamp < cwdAt)) {
        cwd = row.cwd
        cwdAt = row.timestamp
      } else if (row.timestamp === undefined && cwd === undefined) {
        cwd = row.cwd
      }
    }
    if (row.timestamp !== undefined) {
      startAt = startAt === undefined ? row.timestamp : Math.min(startAt, row.timestamp)
      activityEndAt = activityEndAt === undefined ? row.timestamp : Math.max(activityEndAt, row.timestamp)
    }
  }

  if (!cwd) throw new Error("Codex session has no cwd")
  const id = sessionId || fallbackId
  if (!id) throw new Error("Codex session has no id")
  return { session: id, cwd, cwdAt, dir: "", startAt, activityEndAt }
}

function mergeSession(target: Map<string, BackfillSession>, next: BackfillSession): void {
  const current = target.get(next.session)
  if (!current) {
    target.set(next.session, next)
    return
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

/** 从 Codex rollout 文件逐行还原按时间排序的会话事件；单个文件出错只跳过该文件。 */
export async function* backfillCodex(options: BackfillOptions, stats: BackfillStats): AsyncGenerator<RecorderEvent> {
  const paths = (await listCodexFiles(options.root, stats)).filter((filePath) => !olderThanSince(filePath, options.since))
  const readableFiles: string[] = []
  const summaries = new Map<string, BackfillSession>()
  for (const filePath of paths) {
    stats.files += 1
    try {
      mergeSession(summaries, await scanCodexFile(filePath))
      readableFiles.push(filePath)
    } catch {
      stats.skippedFiles += 1
    }
  }
  stats.sessions += summaries.size

  const sessions: BackfillSession[] = []
  for (const session of summaries.values()) {
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

  for (const session of sessions) {
    if (session.startAt === undefined || session.startAt < options.since || session.startAt >= options.until) continue
    eventsBySession.get(session.session)?.push({ v: 1, t: session.startAt, agent: "codex", session: session.session, dir: session.dir, cwd: session.cwd, backfill: true, kind: "start", source: "backfill" })
  }

  for (const filePath of readableFiles) {
    try {
      let fileSessionId = filenameSessionId(filePath)
      for await (const line of readJsonlLines(filePath)) {
        const row = parseCodexRow(line)
        if (row?.type === "session_meta" && row.sessionId) fileSessionId = row.sessionId
        if (row?.type !== "event_msg" || row.timestamp === undefined || row.timestamp < options.since || row.timestamp >= options.until) continue
        if (row.eventType !== "task_started" && row.eventType !== "task_complete") continue
        const session = sessionById.get(fileSessionId ?? "")
        if (!session) continue
        eventsBySession.get(session.session)?.push({
          v: 1,
          t: row.timestamp,
          agent: "codex",
          session: session.session,
          dir: session.dir,
          cwd: session.cwd,
          backfill: true,
          kind: row.eventType === "task_started" ? "prompt" : "stop",
        })
      }
    } catch {
      stats.skippedFiles += 1
    }
  }

  const commits = await commitsBySession(sessions, options.findCommits, options.since, options.until)
  const unassignedCommits: RecorderEvent[] = []
  for (const { commit, repo, session, dir, cwd } of commits) {
    const event: RecorderEvent = {
      v: 1,
      t: commit.committedAt,
      agent: "codex",
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
