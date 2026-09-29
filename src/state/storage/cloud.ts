"use client"

/**
 * 云端存储先以浏览器缓存作为工作基准，save 将变动写入本地和待上传队列；
 * 同步时先分批上传，再从 rev 游标分页拉取，按待上传队列和已知 updatedAt 过滤后合并。
 * 拒绝和拉取的云端记录更新缓存并经 sink 交回仓库；失败时保留内存队列并退避重试。
 */

import { blankWorkbench } from "@/data/seed"
import { todayKey } from "@/domain/calendar"
import { ApiFailure, pull, push } from "@/lib/api"
import { PULL_PAGE_SIZE, PUSH_BATCH_SIZE, type SyncChange, type SyncRecord } from "@/sync/protocol"
import { registerSyncEngine, setSyncState } from "@/state/sync"
import { armFailureSimulation, loadVersioned, removeKey, saveVersioned } from "../persistence"
import { applyRecords, diffData, recordKey, type DataChange } from "./records"
import type { Snapshot, WorkbenchStorage } from "./types"

const CACHE_KEY = "deverdesk:cloud-cache"
const OUTBOX_KEY = "deverdesk:cloud-outbox"
const VERSION = 1
const DEBOUNCE_MS = 800
const SYNC_INTERVAL_MS = 60_000
const RETRY_DELAYS = [5_000, 15_000, 60_000] as const

interface CloudCache {
  snapshot: Snapshot
  cursor: number
  versions: Record<string, number>
}

type Outbox = Record<string, SyncChange>

function blankSnapshot(): Snapshot {
  return {
    meta: { sample: false, seededOn: todayKey(), touched: false },
    data: blankWorkbench(),
  }
}

function hasDataChanges(previous: Snapshot["data"], next: Snapshot["data"]): boolean {
  return (
    previous.profile !== next.profile ||
    previous.projects !== next.projects ||
    previous.tasks !== next.tasks ||
    previous.entries !== next.entries ||
    previous.ledger !== next.ledger ||
    previous.routines !== next.routines ||
    previous.notes !== next.notes ||
    previous.timer !== next.timer
  )
}

export function createCloudStorage(): WorkbenchStorage {
  armFailureSimulation()

  const cached = loadVersioned<CloudCache>(CACHE_KEY, VERSION)
  // 基准就是交给数据仓库的那一份：没有缓存时是一份空白数据，数据仓库直接用它起步，
  // 两边从同一个对象开始，按引用比较才不会把没动过的记录（比如默认作息设置）当成改动传上去
  let base = cached?.snapshot ?? blankSnapshot()
  let cursor = cached?.cursor ?? 0
  let versions: Record<string, number> = { ...(cached?.versions ?? {}) }
  let outbox: Outbox = { ...(loadVersioned<Outbox>(OUTBOX_KEY, VERSION) ?? {}) }
  let sink: { replace(next: Snapshot): void } | null = null

  let started = false
  let authBlocked = false
  let rerunRequested = false
  let inFlight: Promise<void> | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let intervalTimer: ReturnType<typeof setInterval> | null = null
  let retryIndex = 0
  let generation = 0

  const pendingCount = () => Object.keys(outbox).length

  function updatePending() {
    setSyncState({ pending: pendingCount() })
  }

  function persistCache(): boolean {
    return saveVersioned(CACHE_KEY, VERSION, { snapshot: base, cursor, versions } satisfies CloudCache)
  }

  function persistOutbox(): boolean {
    return saveVersioned(OUTBOX_KEY, VERSION, outbox)
  }

  function persistAll(): boolean {
    const cacheOk = persistCache()
    const outboxOk = persistOutbox()
    updatePending()
    return cacheOk && outboxOk
  }

  function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
    if (timer !== null) clearTimeout(timer)
    return null
  }

  function applyRemote(record: SyncRecord): boolean {
    const before = base.data
    const nextData = applyRecords(before, [record as DataChange])
    base = { ...base, data: nextData }
    versions[recordKey(record.kind, record.id)] = record.updatedAt
    return hasDataChanges(before, nextData)
  }

  function scheduleRetry() {
    if (!started || authBlocked) return
    retryTimer = clearTimer(retryTimer)
    const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)]
    retryIndex++
    retryTimer = setTimeout(() => {
      retryTimer = null
      void syncNow()
    }, delay)
  }

  function scheduleDebouncedSync() {
    if (!started || authBlocked) return
    debounceTimer = clearTimer(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void syncNow()
    }, DEBOUNCE_MS)
  }

  async function synchronize(): Promise<void> {
    const runGeneration = generation
    let merged = false
    setSyncState({ status: "syncing", message: null, pending: pendingCount() })

    const stillActive = () => started && !authBlocked && generation === runGeneration
    const sameRun = () => started && generation === runGeneration

    try {
      while (stillActive() && pendingCount() > 0) {
        const batch = Object.values(outbox).slice(0, PUSH_BATCH_SIZE)
        const result = await push(batch)
        if (!stillActive()) return

        for (const change of batch) {
          const key = recordKey(change.kind, change.id)
          if (outbox[key]?.updatedAt === change.updatedAt) delete outbox[key]
        }

        for (const rejected of result.rejected) {
          const key = recordKey(rejected.kind, rejected.id)
          if ((outbox[key]?.updatedAt ?? Number.NEGATIVE_INFINITY) > rejected.updatedAt) continue
          merged = applyRemote(rejected) || merged
        }

        if (!persistAll()) throw new Error("本地同步数据写入失败")
      }

      let pageSince = cursor
      let more = true
      while (stillActive() && more) {
        const page = await pull(pageSince, PULL_PAGE_SIZE)
        if (!stillActive()) return

        for (const record of page.records) {
          const key = recordKey(record.kind, record.id)
          if (outbox[key]) continue
          if (versions[key] !== undefined && versions[key] >= record.updatedAt) continue
          merged = applyRemote(record) || merged
        }

        const nextCursor = Math.max(cursor, page.cursor)
        if (page.more && nextCursor <= pageSince) throw new Error("云端同步游标没有前进")
        cursor = nextCursor
        pageSince = cursor
        more = page.more
        if (!persistCache()) throw new Error("本地云端缓存写入失败")
      }

      if (!stillActive()) return
      retryIndex = 0
      retryTimer = clearTimer(retryTimer)
      setSyncState({ status: "synced", lastSyncedAt: Date.now(), message: null, pending: pendingCount() })
    } catch (error) {
      if (!stillActive()) return
      if (error instanceof ApiFailure && error.kind === "unauthorized") {
        authBlocked = true
        retryTimer = clearTimer(retryTimer)
        debounceTimer = clearTimer(debounceTimer)
        setSyncState({ status: "unauthorized", message: error.message, pending: pendingCount() })
      } else if (error instanceof ApiFailure && error.kind === "network") {
        setSyncState({ status: "offline", message: error.message, pending: pendingCount() })
        scheduleRetry()
      } else {
        const message = error instanceof Error && error.message ? error.message : "同步失败，请稍后重试"
        setSyncState({ status: "error", message, pending: pendingCount() })
        scheduleRetry()
      }
    } finally {
      if (sameRun() && merged && sink) sink.replace(base)
    }
  }

  function syncNow(): Promise<void> {
    if (!started || authBlocked) return Promise.resolve()
    if (inFlight) {
      rerunRequested = true
      return inFlight
    }

    retryTimer = clearTimer(retryTimer)
    inFlight = (async () => {
      do {
        rerunRequested = false
        await synchronize()
      } while (rerunRequested && started && !authBlocked)
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void syncNow()
  }
  const onOnline = () => void syncNow()

  const storage: WorkbenchStorage = {
    kind: "cloud",
    load: () => base,
    save(next) {
      const changes = diffData(base.data, next.data)
      const now = Date.now()
      for (const change of changes) {
        const key = recordKey(change.kind, change.id)
        const updatedAt = Math.max(now, (outbox[key]?.updatedAt ?? versions[key] ?? 0) + 1)
        const entry: SyncChange = { ...change, updatedAt }
        outbox[key] = entry
        versions[key] = updatedAt
      }

      base = next
      const saved = persistAll()
      if (changes.length > 0) scheduleDebouncedSync()
      return saved
    },
    connect(nextSink) {
      sink = nextSink
    },
  }

  registerSyncEngine({
    start() {
      if (started && !authBlocked) return
      if (!started) {
        started = true
        if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange)
        if (typeof window !== "undefined") window.addEventListener("online", onOnline)
        intervalTimer = setInterval(() => {
          if (typeof document !== "undefined" && document.visibilityState === "visible") void syncNow()
        }, SYNC_INTERVAL_MS)
      }
      authBlocked = false
      void syncNow()
    },
    stop() {
      started = false
      authBlocked = false
      rerunRequested = false
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange)
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline)
      debounceTimer = clearTimer(debounceTimer)
      retryTimer = clearTimer(retryTimer)
      if (intervalTimer !== null) clearInterval(intervalTimer)
      intervalTimer = null
    },
    syncNow,
    clearLocal() {
      generation++
      rerunRequested = false
      debounceTimer = clearTimer(debounceTimer)
      retryTimer = clearTimer(retryTimer)
      removeKey(CACHE_KEY)
      removeKey(OUTBOX_KEY)
      base = blankSnapshot()
      cursor = 0
      versions = {}
      outbox = {}
      retryIndex = 0
      setSyncState({ status: "idle", pending: 0, lastSyncedAt: null, message: null })
    },
  })

  updatePending()
  return storage
}
