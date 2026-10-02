import { createHash, randomBytes } from "node:crypto"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import type { CommitFinder, CommitInfo, GitRunner } from "../core/types"
import { logStateFailure, readState, updateStateAsync } from "../store/state"
import { withLockWait } from "../store/lock"

/** 某个仓库的提交状态（存在 state.json 里） */
export interface RepoState {
  head: string
  lastCommitAt: number
  /** 最近 200 个「作者时间|说明」，amend 后不重复记 */
  seen: string[]
}

const RECORD_SEPARATOR = "\x1e"
const FIELD_SEPARATOR = "\x1f"

/** 比较一个仓库的新提交；Git 查询不持有全局状态锁。 */
export async function detectNewCommits(
  git: GitRunner,
  repoRoot: string,
  previous: RepoState | undefined,
  sessionStartMs?: number,
): Promise<{ commits: CommitInfo[]; next: RepoState | undefined }> {
  const headResult = await git.run(["-C", repoRoot, "rev-parse", "HEAD"], repoRoot)
  const head = headResult.ok ? headResult.stdout.trim() : ""
  if (!head) return { commits: [], next: previous }
  if (previous?.head === head) return { commits: [], next: previous }

  const headAt = await readHeadTime(git, repoRoot, previous?.lastCommitAt ?? 0)
  const email = await readUserEmail(git, repoRoot)
  if (!previous) {
    const baseline: RepoState = { head, lastCommitAt: headAt, seen: [] }
    if (sessionStartMs === undefined) return { commits: [], next: baseline }
    const found = await readCommits(git, repoRoot, [["--since=@" + Math.floor(sessionStartMs / 1000), "-n", "50"]])
    const commits = filterCommits(found ?? [], email, new Set())
    return { commits, next: stateAfter(baseline, commits, headAt, head) }
  }

  const found = await readCommits(git, repoRoot, [
    [`${previous.head}..HEAD`],
    ["--since=@" + Math.floor(previous.lastCommitAt / 1000), "-n", "50"],
  ])
  if (!found) return { commits: [], next: stateAfter(previous, [], headAt, head) }
  const commits = filterCommits(found, email, new Set(previous.seen))
  return { commits, next: stateAfter(previous, commits, headAt, head) }
}

/** 在仓库专属锁内发现提交；全局 state.lock 只用于短读改写。 */
export async function detectNewCommitsLocked(
  home: string,
  git: GitRunner,
  repoRoot: string,
  sessionStartMs?: number,
  onCommits?: (commits: CommitInfo[]) => void | Promise<void>,
): Promise<CommitInfo[]> {
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "")
  const lockIdentity = process.platform === "win32" ? root.toLowerCase() : root
  const lockName = createHash("sha256").update(lockIdentity).digest("hex")
  const lockDirectory = join(home, "locks")
  mkdirSync(lockDirectory, { recursive: true })
  const lockPath = join(lockDirectory, `${lockName}.lock`)
  try {
    const locked = await withLockWait(lockPath, 60_000, 3_000, async () => {
      const previous = readState(home).repos[root]
      const result = await detectNewCommits(git, root, previous, sessionStartMs)
      await onCommits?.(result.commits)
      if (result.next) {
        await updateStateAsync(home, async (state) => { state.repos[root] = result.next! })
      }
      return result.commits
    })
    if (locked) return locked.value
    logStateFailure(home, `Could not acquire repository commit lock for ${root}; discovery skipped`)
  } catch (error) {
    logStateFailure(home, `Commit discovery failed for ${root}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return []
}

/** 按时间范围找提交（回填用）；作者邮箱和仓库配置不一致的丢掉，不含合并提交 */
export function createCommitFinder(git: GitRunner): CommitFinder {
  return async (repoRoot, sinceMs, untilMs) => {
    const email = await readUserEmail(git, repoRoot)
    const commits = await readCommits(git, repoRoot, [[
      `--since=@${Math.floor(sinceMs / 1000)}`,
      `--until=@${Math.floor(untilMs / 1000)}`,
    ]])
    return filterCommits(commits ?? [], email, new Set())
  }
}

/** 解析 --format + --numstat：统计行数在当前提交说明后面，记录分隔符因此置于开头。 */
export function parseGitLog(output: string, recordMarker?: string, fieldMarker?: string): CommitInfo[] {
  const recordSeparator = recordMarker ?? findMarker(output, "R") ?? RECORD_SEPARATOR
  const fieldSeparator = fieldMarker ?? findMarker(output, "F") ?? FIELD_SEPARATOR
  const commits: CommitInfo[] = []
  for (const rawRecord of output.split(recordSeparator).slice(1)) {
    const record = rawRecord.replace(/^\r?\n/, "")
    const fields: string[] = []
    let cursor = 0
    for (let index = 0; index < 5; index += 1) {
      const separator = record.indexOf(fieldSeparator, cursor)
      if (separator < 0) break
      fields.push(record.slice(cursor, separator))
      cursor = separator + fieldSeparator.length
    }
    if (fields.length !== 5) continue
    const messageEnd = record.indexOf(fieldSeparator, cursor)
    if (messageEnd < 0) continue

    const sha = fields[0]
    const committedSeconds = fields[1]
    const authoredSeconds = fields[2]
    const authorEmail = fields[3]
    const subject = fields[4] ?? ""
    if (!sha || committedSeconds === undefined || authoredSeconds === undefined || authorEmail === undefined) continue
    const committedAt = Number(committedSeconds) * 1000
    const authoredAt = Number(authoredSeconds) * 1000
    if (!Number.isFinite(committedAt) || !Number.isFinite(authoredAt)) continue

    const message = record.slice(cursor, messageEnd).replace(/\r?\n$/, "")
    const body = message.split(/\r?\n/).slice(1).join("\n").trim().slice(0, 500)
    let additions = 0
    let deletions = 0
    let files = 0
    const numstat = record.slice(messageEnd + fieldSeparator.length)
    for (const line of numstat.split(/\r?\n/)) {
      if (!line) continue
      const firstTab = line.indexOf("\t")
      const secondTab = firstTab < 0 ? -1 : line.indexOf("\t", firstTab + 1)
      if (secondTab < 0) continue
      const added = line.slice(0, firstTab)
      const deleted = line.slice(firstTab + 1, secondTab)
      if (!added || !deleted) continue
      files += 1
      if (added !== "-") additions += toCount(added)
      if (deleted !== "-") deletions += toCount(deleted)
    }
    commits.push({
      sha,
      committedAt,
      authoredAt,
      authorEmail,
      subject,
      body,
      additions,
      deletions,
      files,
    })
  }
  return commits.reverse()
}

async function readCommits(git: GitRunner, repoRoot: string, ranges: string[][]): Promise<CommitInfo[] | undefined> {
  for (const range of ranges) {
    for (const includeNumstat of [true, false]) {
      const result = await runLog(git, repoRoot, range, includeNumstat)
      if (result.ok) return parseGitLog(result.stdout, result.recordSeparator, result.fieldSeparator)
    }
  }
  return undefined
}

async function runLog(git: GitRunner, repoRoot: string, extra: string[], includeNumstat: boolean) {
  const nonce = randomBytes(8).toString("hex")
  const recordSeparator = `${String.fromCharCode(30)}${nonce}R${String.fromCharCode(30)}`
  const fieldSeparator = `${String.fromCharCode(31)}${nonce}F${String.fromCharCode(31)}`
  const format = `${recordSeparator}%H${fieldSeparator}%ct${fieldSeparator}%at${fieldSeparator}%ae${fieldSeparator}%s${fieldSeparator}%B${fieldSeparator}`
  const result = await git.run([
    "-C", repoRoot, "log", "--no-merges", `--format=${format}`,
    ...(includeNumstat ? ["--numstat"] : []), ...extra,
  ], repoRoot)
  return { ...result, recordSeparator, fieldSeparator }
}

function findMarker(output: string, ending: "R" | "F"): string | undefined {
  const separator = String.fromCharCode(ending === "R" ? 30 : 31)
  let index = output.indexOf(separator)
  while (index >= 0) {
    const candidate = output.slice(index, index + 19)
    const nonce = candidate.slice(1, 17)
    if (candidate[17] === ending && candidate[18] === separator && nonce.length === 16
      && [...nonce].every((character) => "0123456789abcdef".includes(character))) return candidate
    index = output.indexOf(separator, index + 1)
  }
  return undefined
}

async function readUserEmail(git: GitRunner, repoRoot: string): Promise<string | undefined> {
  const result = await git.run(["-C", repoRoot, "config", "user.email"], repoRoot)
  const email = result.ok ? result.stdout.trim() : ""
  return email ? email.toLocaleLowerCase() : undefined
}

async function readHeadTime(git: GitRunner, repoRoot: string, fallback: number): Promise<number> {
  const result = await git.run(["-C", repoRoot, "log", "-1", "--format=%ct", "HEAD"], repoRoot)
  const seconds = result.ok ? Number(result.stdout.trim()) : Number.NaN
  return Number.isFinite(seconds) ? seconds * 1000 : fallback
}

function filterCommits(commits: CommitInfo[], email: string | undefined, seen: Set<string>): CommitInfo[] {
  return commits.filter((commit) => {
    if (email && commit.authorEmail.toLocaleLowerCase() !== email) return false
    const key = `${commit.authoredAt}|${commit.subject}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stateAfter(previous: RepoState, commits: CommitInfo[], headAt: number, head = previous.head): RepoState {
  const seen = [...previous.seen]
  for (const commit of commits) {
    const key = `${commit.authoredAt}|${commit.subject}`
    if (!seen.includes(key)) seen.push(key)
  }
  return { head, lastCommitAt: headAt || commits.at(-1)?.committedAt || previous.lastCommitAt, seen: seen.slice(-200) }
}

function toCount(value: string): number {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? count : 0
}
