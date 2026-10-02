import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { dirNameKey } from "../../../../src/domain/dir-names"
import { type BindingsResponse, type UploadRequest } from "../../../../src/sync/recorder-protocol"
import { SETTLE_DELAY } from "../core/constants"
import { computeTasks as computeTasksDefault } from "../core/engine"
import type { ComputedTask, EngineResult, GitRunner, RecorderEvent } from "../core/types"
import { withLock as withLockDefault } from "../store/lock"
import { readEvents as readEventsDefault } from "../store/event-log"
import { appendUploaded as appendUploadedDefault, readState as readStateDefault, readUploadedKeys as readUploadedKeysDefault, updateState as updateStateDefault, type RecorderState } from "../store/state"
import type { Credentials } from "../store/config"
import { RecorderHttpError, type RecorderClient } from "../upload/client"
import { buildUploadRequests, compactUploadKey } from "../upload/build-payload"
import { RECORDER_VERSION } from "../version"
import { syncLive } from "./live"

const SYNC_LOCK_STALE_MS = 5 * 60_000
const BINDINGS_CACHE_MS = 5 * 60_000
const MAX_DELAY_MS = 20 * 60_000
const RECORDER_NAME = "deverdesk-recorder"

export interface SyncState {
  withLock<T>(path: string, staleMs: number, fn: () => Promise<T>): Promise<{ value: T } | null>
  readState(home: string): RecorderState
  updateState(home: string, update: (state: RecorderState) => RecorderState | void): Promise<RecorderState>
  readUploadedKeys(home: string): { done: Set<string>; rejected: Map<string, string> }
  appendUploaded(home: string, lines: { k: string; at: number; rejected?: string }[]): void
}
export function createDefaultSyncState(): SyncState {
  return {
    withLock: withLockDefault,
    readState: readStateDefault,
    updateState: updateStateDefault,
    readUploadedKeys: readUploadedKeysDefault,
    appendUploaded: appendUploadedDefault,
  }
}
export interface BindingsCache {
  fetchedAt: number
  bindings: BindingsResponse["bindings"]
}
export interface SyncInput {
  home: string
  now?: number
  creds: Credentials | null
  client: RecorderClient
  git?: GitRunner
  compute?: (events: readonly RecorderEvent[], now: number) => EngineResult
  readEvents?: (home: string, options: { days?: number; now?: number }) => RecorderEvent[]
  state: SyncState
  bindingsCache?: {
    read(home: string): BindingsCache | null
    write(home: string, cache: BindingsCache): void
  }
  options: { all: boolean; dryRun: boolean; days?: number; delayMs?: number; settleLockPath?: string }
  sleep?: (ms: number) => Promise<void>
  spawnSync?: (delayMs: number) => void
  removeSettleLock?: (path: string) => void
  settleSchedule?: {
    read(home: string): string | null
    write(home: string, fingerprint: string): void
  }
}
export interface SyncResult {
  uploadedTasks: number
  uploadedEntries: number
  skipped: number
  rejected: number
  liveSent: boolean
  taskKeys?: string[]
  entryKeys?: string[]
  error?: string
}
export type SyncOutcome = SyncResult | { skipped: "locked" }

const diskBindingsCache = {
  read(home: string): BindingsCache | null {
    const path = join(home, "bindings.json")
    if (!existsSync(path)) return null
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
      if (typeof parsed !== "object" || parsed === null || !("fetchedAt" in parsed) || !("bindings" in parsed)) return null
      if (typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.bindings)) return null
      return parsed as BindingsCache
    } catch {
      return null
    }
  },
  write(home: string, cache: BindingsCache): void {
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, "bindings.json"), `${JSON.stringify(cache)}\n`, "utf8")
  },
}
const diskSettleSchedule = {
  read(home: string): string | null {
    try {
      return readFileSync(join(home, "settle-schedule"), "utf8")
    } catch {
      return null
    }
  },
  write(home: string, fingerprint: string): void {
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, "settle-schedule"), fingerprint, "utf8")
  },
}

function nextTaskArrival(events: readonly RecorderEvent[], now: number, currentTasks: readonly ComputedTask[], compute: SyncInput["compute"]): { delay: number; beforeFiveSeconds: boolean } | undefined {
  const currentKeys = new Set(currentTasks.map((task) => task.key))
  const hasNewTask = (at: number) => (compute ?? computeTasksDefault)(events, at).tasks.some((task) => !currentKeys.has(task.key))
  let low = now
  let high = now + SETTLE_DELAY
  if (!hasNewTask(high)) return undefined
  while (high - low > 5_000) {
    const middle = Math.floor((low + high) / 2)
    if (hasNewTask(middle)) high = middle
    else low = middle
  }
  const roundedAt = Math.ceil(high / 5_000) * 5_000
  return {
    delay: Math.max(5_000, roundedAt + 1_000 - now),
    beforeFiveSeconds: high - now <= 5_000,
  }
}

function scheduleNextSync(input: SyncInput & { now: number }, events: readonly RecorderEvent[], currentTasks: readonly ComputedTask[], compute: SyncInput["compute"]): void {
  if (!input.spawnSync) return
  const next = nextTaskArrival(events, input.now, currentTasks, compute)
  if (!next) return
  if (next.beforeFiveSeconds) {
    const fingerprint = createHash("sha256").update(JSON.stringify(events)).digest("hex")
    const store = input.settleSchedule ?? diskSettleSchedule
    try {
      if (store.read(input.home) === fingerprint) return
      store.write(input.home, fingerprint)
    } catch {
      // A failed guard write must not prevent an otherwise useful delayed sync.
    }
  }
  input.spawnSync(next.delay)
}

function sameBindings(left: readonly { dir: string }[], right: readonly { dir: string }[]): boolean {
  const normalize = (bindings: readonly { dir: string }[]) => bindings.map((binding) => dirNameKey(binding.dir)).sort()
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}
function isTransient(error: unknown): boolean {
  return error instanceof RecorderHttpError && (error.kind === "network" || error.kind === "server")
}
function rejectionValue(version: string, reason: string): string {
  return `${version}\t${reason}`
}

function rejectedForVersion(value: string | undefined, version: string): boolean {
  return value?.startsWith(`${version}\t`) ?? false
}

function appendKeys(state: SyncState, home: string, task: ComputedTask, at: number, payloadEntries = task.entries, payloadTaskKey = task.key): void {
  const keys = new Set([task.key, payloadTaskKey, ...task.entries.map((entry) => entry.key), ...payloadEntries.map((entry) => entry.key)])
  state.appendUploaded(home, [...keys].map((key) => ({ k: key, at })))
}

function responseSkips(request: UploadRequest, response: Awaited<ReturnType<RecorderClient["upload"]>>): Map<string, string> {
  const known = new Set(request.tasks.map((task) => task.key))
  return new Map(response.skipped.filter((item) => known.has(item.key)).map((item) => [item.key, item.reason]))
}

export async function runSync(input: SyncInput): Promise<SyncOutcome> {
  const requestedDelay = Math.max(0, input.options.delayMs ?? 0)
  const delayMs = Math.min(requestedDelay, MAX_DELAY_MS)
  const requestedNow = input.now ?? Date.now()
  if (delayMs > 0) {
    await (input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(delayMs)
    const lockPath = input.options.settleLockPath ?? join(input.home, `settle-${requestedNow + delayMs}.lock`)
    try {
      ;(input.removeSettleLock ?? ((path) => rmSync(path, { force: true })))(lockPath)
    } catch {
      // Delayed sync must proceed if a stale settle marker cannot be removed.
    }
  }
  const now = input.now === undefined ? (delayMs > 0 ? Date.now() : requestedNow) : requestedNow + delayMs
  const locked = await input.state.withLock(join(input.home, "sync.lock"), SYNC_LOCK_STALE_MS, async () => {
    return runLocked({ ...input, now })
  })
  return locked?.value ?? { skipped: "locked" }
}

async function runLocked(input: SyncInput & { now: number }): Promise<SyncResult> {
  const emptyResult = (): SyncResult => ({ uploadedTasks: 0, uploadedEntries: 0, skipped: 0, rejected: 0, liveSent: false })
  if (!input.creds) {
    return { ...emptyResult(), error: "未配置凭据" }
  }

  const cacheStore = input.bindingsCache ?? diskBindingsCache
  const oldCache = cacheStore.read(input.home)
  let pendingCache: BindingsCache | undefined
  let bindings = oldCache?.bindings
  let changed = oldCache === null
  if (!oldCache || input.now - oldCache.fetchedAt >= BINDINGS_CACHE_MS) {
    try {
      const fresh = await input.client.getBindings()
      bindings = fresh.bindings
      changed = oldCache === null || !sameBindings(oldCache.bindings, fresh.bindings)
      if (!input.options.dryRun) pendingCache = { fetchedAt: input.now, bindings: fresh.bindings }
    } catch (error) {
      if (oldCache && isTransient(error)) {
        bindings = oldCache.bindings
        changed = false
      } else {
        const message = error instanceof Error ? error.message : String(error)
        await saveLastSync(input, false, message, 0)
        return { ...emptyResult(), error: message }
      }
    }
  }
  if (!bindings) {
    const message = "没有可用的目录绑定清单"
    await saveLastSync(input, false, message, 0)
    return { ...emptyResult(), error: message }
  }

  const eventOptions: { days?: number; now: number } = { now: input.now }
  if (!input.options.all && !changed) eventOptions.days = input.options.days ?? 60
  const events = (input.readEvents ?? readEventsDefault)(input.home, eventOptions)
  const compute = input.compute ?? computeTasksDefault
  const result = compute(events, input.now)
  const boundKeys = new Set(bindings.map((binding) => dirNameKey(binding.dir)))
  const uploaded = input.state.readUploadedKeys(input.home)
  const clientInfo = { name: RECORDER_NAME, version: RECORDER_VERSION, agent: "codex" as const }
  const candidates = result.tasks.flatMap((task) => {
    if (!boundKeys.has(dirNameKey(task.dir))) return []
    if (rejectedForVersion(uploaded.rejected.get(task.key), RECORDER_VERSION)) return []
    const entries = task.entries.filter((entry) => !uploaded.done.has(entry.key))
    if (uploaded.done.has(task.key) && entries.length === 0) return []
    return [{ ...task, entries }]
  })
  const requests = buildUploadRequests(candidates, clientInfo, uploaded.done)
  if (input.options.dryRun) {
    return {
      ...emptyResult(),
      taskKeys: requests.flatMap((request) => request.tasks.map((task) => task.key)),
      entryKeys: requests.flatMap((request) => request.tasks.flatMap((task) => task.entries.map((entry) => entry.key))),
    }
  }

  const totals = emptyResult()
  for (const request of requests) {
    try {
      const response = await input.client.upload(request)
      applyUploadResponse(input, request, response, candidates, totals)
    } catch (error) {
      if (error instanceof RecorderHttpError && error.status === 400) {
        const stopped = await retrySingleTasks(input, request, candidates, totals)
        if (stopped) {
          await saveLastSync(input, false, stopped, totals.uploadedTasks)
          return { ...totals, error: stopped }
        }
        continue
      }
      const message = error instanceof Error ? error.message : String(error)
      await saveLastSync(input, false, message, totals.uploadedTasks)
      return { ...totals, error: message }
    }
  }

  try {
    totals.liveSent = await syncLive({ home: input.home, now: input.now, windows: result.open, bindings, client: input.client, state: input.state })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await saveLastSync(input, false, message, totals.uploadedTasks)
    return { ...totals, error: message }
  }

  try {
    if (pendingCache) cacheStore.write(input.home, pendingCache)
  } catch {
    // A stale cache is safe; the next sync will fetch bindings and retry.
  }
  scheduleNextSync(input, events, result.tasks, compute)

  await saveLastSync(input, true, undefined, totals.uploadedTasks)
  return totals
}

function applyUploadResponse(
  input: SyncInput & { now: number },
  request: UploadRequest,
  response: Awaited<ReturnType<RecorderClient["upload"]>>,
  candidates: ComputedTask[],
  totals: SyncResult,
): void {
  const skipped = responseSkips(request, response)
  const tasksByKey = new Map(candidates.map((task) => [compactUploadKey(task.key), task]))
  for (const payloadTask of request.tasks) {
    const task = tasksByKey.get(payloadTask.key)
    if (!task) continue
    const reason = skipped.get(task.key)
    if (reason === "unbound") {
      totals.skipped += 1
    } else if (reason === "invalid") {
      input.state.appendUploaded(input.home, [{ k: task.key, at: input.now, rejected: rejectionValue(RECORDER_VERSION, "服务器拒绝该任务") }])
      totals.rejected += 1
    } else {
      appendKeys(input.state, input.home, task, input.now, payloadTask.entries, payloadTask.key)
      totals.uploadedTasks += 1
      totals.uploadedEntries += payloadTask.entries.length
    }
  }
}

async function retrySingleTasks(
  input: SyncInput & { now: number },
  request: UploadRequest,
  candidates: ComputedTask[],
  totals: SyncResult,
): Promise<string | undefined> {
  const tasksByKey = new Map(candidates.map((task) => [compactUploadKey(task.key), task]))
  for (const payloadTask of request.tasks) {
    const oneTaskRequest: UploadRequest = { ...request, tasks: [payloadTask] }
    try {
      const response = await input.client.upload(oneTaskRequest)
      applyUploadResponse(input, oneTaskRequest, response, candidates, totals)
    } catch (error) {
      if (error instanceof RecorderHttpError && error.status === 400) {
        const task = tasksByKey.get(payloadTask.key)
        if (task) {
          input.state.appendUploaded(input.home, [{ k: task.key, at: input.now, rejected: rejectionValue(RECORDER_VERSION, error.message) }])
          totals.rejected += 1
        }
        continue
      }
      return error instanceof Error ? error.message : String(error)
    }
  }
  return undefined
}

async function saveLastSync(input: SyncInput & { now: number }, ok: boolean, message: string | undefined, uploadedTasks: number): Promise<void> {
  await input.state.updateState(input.home, (state) => ({
    ...state,
    lastSync: {
      startedAt: input.now,
      finishedAt: input.now,
      ok,
      ...(message === undefined ? {} : { message }),
      uploadedTasks,
    },
  }))
}
