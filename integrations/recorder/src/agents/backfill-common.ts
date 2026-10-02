import { createReadStream } from "node:fs"
import type { CommitInfo, CommitFinder } from "../core/types"
import { PRESENCE_GAP } from "../core/constants"

export const MAX_JSONL_LINE_BYTES = 8 * 1024 * 1024

export interface BackfillSession {
  session: string
  cwd: string
  cwdAt?: number
  dir: string
  repo?: string
  startAt?: number
  activityEndAt?: number
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 按字节分块读行，并在异常长行耗尽内存前中止当前文件。 */
export async function* readJsonlLines(filePath: string): AsyncGenerator<string> {
  const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 })
  let parts: Buffer[] = []
  let lineBytes = 0

  try {
    for await (const chunk of stream) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      let start = 0
      while (start < data.length) {
        const newline = data.indexOf(0x0a, start)
        const end = newline === -1 ? data.length : newline
        const part = data.subarray(start, end)
        if (part.length > 0) {
          lineBytes += part.length
          if (lineBytes > MAX_JSONL_LINE_BYTES) throw new Error("JSONL line exceeds limit")
          parts.push(part)
        }

        if (newline === -1) break

        let line = parts.length === 0 ? Buffer.alloc(0) : Buffer.concat(parts, lineBytes)
        if (line.length > 0 && line[line.length - 1] === 0x0d) line = line.subarray(0, -1)
        yield line.toString("utf8")
        parts = []
        lineBytes = 0
        start = newline + 1
      }
    }

    if (lineBytes > 0) {
      let line = Buffer.concat(parts, lineBytes)
      if (line[line.length - 1] === 0x0d) line = line.subarray(0, -1)
      yield line.toString("utf8")
    }
  } finally {
    stream.destroy()
  }
}

/** 提取首句并限制长度，避免把多段输入塞进事件日志。 */
export function firstBackfillSentence(text: string, maxLength: number): string {
  const normalized = text.trim()
  if (!normalized) return ""

  let end = normalized.length
  for (let index = 0; index < normalized.length; index += 1) {
    if (".!?。！？".includes(normalized[index] ?? "") && (index + 1 === normalized.length || /\s/u.test(normalized[index + 1] ?? ""))) {
      end = index + 1
      break
    }
    if (normalized[index] === "\n" || normalized[index] === "\r") {
      end = index
      break
    }
  }

  return normalized.slice(0, Math.min(end, maxLength)).trimEnd()
}

interface ActiveInterval {
  session: BackfillSession
  start: number
  end: number
}

export interface BackfillCommit {
  commit: CommitInfo
  repo: string
  session: string
  dir: string
  cwd: string
}

/** 每仓库只查一次；提交保留一次，并优先附到时间上最可能的会话。 */
export async function commitsBySession(
  sessions: BackfillSession[],
  findCommits: CommitFinder,
  since: number,
  until: number,
): Promise<BackfillCommit[]> {
  const byRepo = new Map<string, ActiveInterval[]>()
  for (const session of sessions) {
    if (!session.repo || session.startAt === undefined) continue
    const start = session.startAt
    const end = (session.activityEndAt ?? start) + PRESENCE_GAP
    if (end < since || start >= until) continue
    const intervals = byRepo.get(session.repo) ?? []
    intervals.push({ session, start, end })
    byRepo.set(session.repo, intervals)
  }

  const result: BackfillCommit[] = []
  const seenShas = new Set<string>()
  for (const [repo, intervals] of byRepo) {
    const rangeStart = Math.max(Math.min(...intervals.map((interval) => interval.start)), since)
    const rangeEnd = Math.min(Math.max(...intervals.map((interval) => interval.end)), until)
    if (rangeStart >= rangeEnd) continue

    let commits: CommitInfo[]
    try {
      commits = await findCommits(repo, rangeStart, rangeEnd)
    } catch {
      continue
    }

    for (const commit of commits) {
      if (seenShas.has(commit.sha) || commit.committedAt < since || commit.committedAt >= until) continue
      seenShas.add(commit.sha)
      const candidates = intervals
        .filter((interval) => commit.committedAt >= interval.start && commit.committedAt <= interval.end)
        .sort((left, right) => right.start - left.start || left.session.session.localeCompare(right.session.session))
      const owner = candidates[0]?.session
      const context = owner ?? intervals
        .map((interval) => ({
          session: interval.session,
          distance: commit.committedAt < interval.start
            ? interval.start - commit.committedAt
            : commit.committedAt > interval.end
              ? commit.committedAt - interval.end
              : 0,
        }))
        .sort((left, right) => left.distance - right.distance || (right.session.startAt ?? 0) - (left.session.startAt ?? 0))[0]?.session
      if (!context) continue
      result.push({
        commit,
        repo,
        session: owner?.session ?? "",
        dir: context.dir,
        cwd: context.cwd,
      })
    }
  }

  return result
}
