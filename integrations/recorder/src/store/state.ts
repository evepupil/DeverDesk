import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type { Agent } from "../core/types"
import { withLockWait } from "./lock"
import type { RepoState } from "../git/commits"

export interface RecorderState {
  v: 1
  /** 工作树根 → 提交状态 */
  repos: Record<string, RepoState>
  /** cwd → 目录名缓存（有效期 1 天） */
  dirCache: Record<string, { dir: string; repo?: string; at: number }>
  /** 各 agent 第一个实时事件的时间（回填只填它之前的） */
  firstLiveEvent: Partial<Record<Agent, number>>
  /** session key → 这个会话的首个实时 SessionStart（避免钩子扫描全部历史事件） */
  sessionStarts: Record<string, { agent: Agent; session: string; at: number }>
  /** 最近一次钩子事件（doctor 用） */
  lastHook?: { at: number; agent: Agent; event: string; session: string }
  lastSync?: { startedAt: number; finishedAt: number; ok: boolean; message?: string; uploadedTasks?: number }
  /** 最近一次 PUT 进行中的内容和时间（用来省重复请求） */
  lastLive?: { at: number; fingerprint: string }
}

export function emptyState(): RecorderState {
  return { v: 1, repos: {}, dirCache: {}, firstLiveEvent: {}, sessionStarts: {} }
}

/** 读-改-写；状态锁等待和文件替换均有界，持久写入失败会记本机日志。 */
export async function updateState(
  home: string,
  fn: (state: RecorderState) => RecorderState | void,
): Promise<RecorderState> {
  return updateStateInternal(home, fn)
}

export async function updateStateAsync(
  home: string,
  fn: (state: RecorderState) => Promise<RecorderState | void>,
): Promise<RecorderState> {
  return updateStateInternal(home, fn)
}

async function updateStateInternal(
  home: string,
  fn: (state: RecorderState) => RecorderState | void | Promise<RecorderState | void>,
): Promise<RecorderState> {
  mkdirSync(home, { recursive: true })
  const lockPath = join(home, "state.lock")
  const result = await withLockWait(lockPath, 10_000, 3_000, async () => {
    cleanStateTemps(home)
    const state = readState(home)
    const changed = await fn(state)
    const next = changed ?? state
    await writeState(home, next)
    return next
  })
  if (result) return result.value
  logStateFailure(home, "Could not acquire state.lock within 3 seconds; state update skipped")
  return readState(home)
}

/** 只读（不加锁）；文件不存在或坏了返回空状态 */
export function readState(home: string): RecorderState {
  try {
    const value: unknown = JSON.parse(readFileSync(join(home, "state.json"), "utf8"))
    if (!isRecord(value) || value.v !== 1 || !isRecord(value.repos) || !isRecord(value.dirCache) || !isRecord(value.firstLiveEvent)) {
      return emptyState()
    }
    const state = value as unknown as RecorderState
    if (!isRecord(state.sessionStarts)) state.sessionStarts = {}
    return state
  } catch {
    return emptyState()
  }
}

/** uploaded.jsonl：每行 { k: 键, at: 毫秒, rejected?: 原因 }；只有持有 sync.lock 的同步进程追加 */
export function readUploadedKeys(home: string): { done: Set<string>; rejected: Map<string, string> } {
  const done = new Set<string>()
  const rejected = new Map<string, string>()
  let contents: string
  try {
    contents = readFileSync(join(home, "uploaded.jsonl"), "utf8")
  } catch {
    return { done, rejected }
  }

  for (const line of contents.split(/\r?\n/)) {
    if (!line) continue
    try {
      const value: unknown = JSON.parse(line)
      if (!isRecord(value) || typeof value.k !== "string" || typeof value.at !== "number") continue
      if (typeof value.rejected === "string") {
        done.delete(value.k)
        rejected.set(value.k, value.rejected)
      } else {
        rejected.delete(value.k)
        done.add(value.k)
      }
    } catch {
      // 保留其他有效行。
    }
  }
  return { done, rejected }
}

export function appendUploaded(home: string, lines: { k: string; at: number; rejected?: string }[]): void {
  if (lines.length === 0) return
  mkdirSync(home, { recursive: true })
  const contents = lines.map((line) => `${JSON.stringify(line)}\n`).join("")
  appendFileSync(join(home, "uploaded.jsonl"), contents, "utf8")
}

async function writeState(home: string, state: RecorderState): Promise<void> {
  const destination = join(home, "state.json")
  const temporary = join(home, `.state-${process.pid}-${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8")
    const deadline = Date.now() + 1000
    while (true) {
      try {
        renameSync(temporary, destination)
        return
      } catch (error) {
        if (!isRetryableRenameError(error) || Date.now() >= deadline) {
          logStateFailure(home, `state.json write failed: ${errorMessage(error)}`)
          return
        }
        await sleep(Math.min(20 + Math.floor(Math.random() * 61), deadline - Date.now()))
      }
    }
  } catch (error) {
    logStateFailure(home, `state.json write failed: ${errorMessage(error)}`)
  } finally {
    try {
      unlinkSync(temporary)
    } catch {
      // rename normally consumed the temporary file.
    }
  }
}

export function logStateFailure(home: string, message: string): void {
  try {
    const logs = join(home, "logs")
    mkdirSync(logs, { recursive: true })
    appendFileSync(join(logs, "recorder.log"), `${new Date().toISOString()} ${message}\n`, "utf8")
  } catch {
    // State failures must not stop the hook or sync path.
  }
}

function cleanStateTemps(home: string): void {
  let names: string[]
  try {
    names = readdirSync(home)
  } catch {
    return
  }
  const cutoff = Date.now() - 10 * 60_000
  for (const name of names) {
    if (!/^\.state-.*\.tmp$/.test(name)) continue
    const path = join(home, name)
    try {
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path)
    } catch {
      // Another process may already have removed the stale temporary file.
    }
  }
}

function isRetryableRenameError(error: unknown): boolean {
  return error instanceof Error && ["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

