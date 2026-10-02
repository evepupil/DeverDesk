import { join } from "node:path"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { UploadResponse } from "../../../../src/sync/recorder-protocol"
import type { ComputedTask, EngineResult, RecorderEvent } from "../core/types"
import { emptyState, type RecorderState } from "../store/state"
import { createClient, RecorderHttpError, type RecorderClient } from "../upload/client"
import { runSync, type BindingsCache, type SyncInput, type SyncState } from "./sync"

const NOW = Date.parse("2025-04-01T12:00:00.000Z")

function makeTask(overrides: Partial<ComputedTask> = {}): ComputedTask {
  return {
    key: "codex:session:d:100",
    agent: "codex",
    session: "session",
    dir: "Repo",
    source: "done",
    title: "Synthetic task",
    finishedAt: NOW - 100_000,
    commits: [],
    entries: [{ key: "entry-1", start: NOW - 120_000, end: NOW - 60_000, minutes: 1 }],
    ...overrides,
  }
}

function makeFixture(options: {
  tasks?: ComputedTask[]
  open?: EngineResult["open"]
  bindings?: { dir: string; projectId: string; projectName: string }[]
  uploaded?: string[]
  rejected?: Map<string, string>
  upload?: RecorderClient["upload"]
  getBindings?: RecorderClient["getBindings"]
} = {}) {
  let current: RecorderState = emptyState()
  const done = new Set(options.uploaded ?? [])
  const rejected = new Map(options.rejected ?? [])
  const uploadedLines: { k: string; at: number; rejected?: string }[] = []
  const updates = vi.fn(async (_home: string, update: (state: RecorderState) => RecorderState | void) => {
    current = update(current) ?? current
    return current
  })
  const state: SyncState = {
    withLock: vi.fn(async (_path, _stale, fn) => ({ value: await fn() })),
    readState: () => current,
    updateState: updates,
    readUploadedKeys: () => ({ done, rejected }),
    appendUploaded: (_home, lines) => {
      uploadedLines.push(...lines)
      for (const line of lines) {
        if (line.rejected !== undefined) rejected.set(line.k, line.rejected)
        else done.add(line.k)
      }
    },
  }
  let cache: BindingsCache | null = null
  const bindingsCache = {
    read: () => cache,
    write: (_home: string, next: BindingsCache) => { cache = next },
  }
  const upload = options.upload ?? vi.fn(async () => ({ created: { tasks: 1, entries: 1 }, skipped: [], changesetId: "change-1" }) satisfies UploadResponse)
  const client: RecorderClient = {
    getBindings: options.getBindings ?? vi.fn(async () => ({ bindings: options.bindings ?? [{ dir: "repo", projectId: "p1", projectName: "Project" }] })),
    getBriefing: vi.fn(async () => ({ bound: false, today: "2025-04-01", plannedToday: [], overdue: [], open: [] })),
    upload,
    putLive: vi.fn(async () => undefined),
  }
  const result: EngineResult = { tasks: options.tasks ?? [makeTask()], open: options.open ?? [] }
  const readEvents = vi.fn((home: string, options: { days?: number; now?: number }) => {
    void home
    void options
    return [] as RecorderEvent[]
  })
  const input: SyncInput = {
    home: "/virtual/recorder",
    now: NOW,
    creds: { url: "https://example.test", token: "dd_test", source: "config" },
    client,
    compute: vi.fn(() => result),
    readEvents,
    state,
    bindingsCache,
    options: { all: false, dryRun: false },
  }
  return { input, client, state, done, rejected, uploadedLines, updates, readEvents, result, cache: () => cache }
}

const openWindow = { session: "live-1", dir: "Repo", agent: "codex" as const, since: NOW - 30_000, minutes: 1 }

afterEach(() => vi.restoreAllMocks())

describe("runSync", () => {
  it("schedules idle arrivals for their actual arrival time, but not settled tasks", async () => {
    const lastMotion = NOW - 110 * 60_000
    const idle = makeTask({ key: "idle-arrival", source: "idle", finishedAt: lastMotion })
    const fixture = makeFixture({ tasks: [] })
    const arrivalAt = NOW + 10 * 60_000
    fixture.input.compute = vi.fn((_events, at) => ({ tasks: at >= arrivalAt ? [idle] : [], open: [] }))
    const spawnSync = vi.fn()
    fixture.input.spawnSync = spawnSync
    await runSync(fixture.input)
    expect(spawnSync).toHaveBeenCalledOnce()
    expect(spawnSync.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(10 * 60_000)
    expect(spawnSync.mock.calls[0]?.[0]).toBeLessThanOrEqual(10 * 60_000 + 6_000)

    const settled = makeFixture({ tasks: [idle] })
    settled.input.compute = vi.fn(() => ({ tasks: [idle], open: [] }))
    const settledSpawn = vi.fn()
    settled.input.spawnSync = settledSpawn
    await runSync(settled.input)
    expect(settledSpawn).not.toHaveBeenCalled()
  })

  it("keeps a 5-second settle retry from repeating for the same event batch", async () => {
    const fixture = makeFixture({ tasks: [] })
    const pending = makeTask({ key: "almost-arrived" })
    fixture.input.compute = vi.fn((_events, at) => ({ tasks: at >= NOW + 1_000 ? [pending] : [], open: [] }))
    const spawnSync = vi.fn()
    fixture.input.spawnSync = spawnSync
    const schedules = new Map<string, string>()
    fixture.input.settleSchedule = {
      read: () => schedules.get(fixture.input.home) ?? null,
      write: (_home, fingerprint) => { schedules.set(fixture.input.home, fingerprint) },
    }
    await runSync(fixture.input)
    await runSync(fixture.input)
    expect(spawnSync).toHaveBeenCalledOnce()
    expect(spawnSync).toHaveBeenCalledWith(6_000)
  })

  it("uploads bound tasks, appends task and entry keys, and updates live state", async () => {
    const fixture = makeFixture({ open: [openWindow] })
    const result = await runSync(fixture.input)
    expect(result).toMatchObject({ uploadedTasks: 1, uploadedEntries: 1, skipped: 0, rejected: 0, liveSent: true })
    expect(fixture.client.upload).toHaveBeenCalledOnce()
    expect(fixture.uploadedLines.map((line) => line.k)).toEqual(["codex:session:d:100", "entry-1"])
    expect(fixture.client.putLive).toHaveBeenCalledWith({ windows: [openWindow] })
    expect(fixture.state.readState(fixture.input.home).lastSync?.ok).toBe(true)
    expect(fixture.cache()?.bindings[0]?.dir).toBe("repo")
  })

  it("uses all events when the bindings list first appears or changes", async () => {
    const fixture = makeFixture()
    await runSync(fixture.input)
    expect(fixture.readEvents).toHaveBeenLastCalledWith(fixture.input.home, { now: NOW })
    expect(fixture.cache()?.fetchedAt).toBe(NOW)

    const cached = makeFixture()
    cached.input.bindingsCache?.write(cached.input.home, { fetchedAt: NOW - 6 * 60_000, bindings: [{ dir: "old", projectId: "p", projectName: "Old" }] })
    await runSync(cached.input)
    expect(cached.readEvents).toHaveBeenLastCalledWith(cached.input.home, { now: NOW })
  })

  it("uses the recent-days window with an unchanged binding cache and falls back to stale cache offline", async () => {
    const fixture = makeFixture({ getBindings: vi.fn(async () => { throw new RecorderHttpError(0, "network", "offline") }) })
    fixture.input.bindingsCache?.write(fixture.input.home, {
      fetchedAt: NOW - 6 * 60_000,
      bindings: [{ dir: "repo", projectId: "p", projectName: "Project" }],
    })
    await runSync(fixture.input)
    expect(fixture.readEvents).toHaveBeenLastCalledWith(fixture.input.home, { now: NOW, days: 60 })
    expect(fixture.input.state.readState(fixture.input.home).lastSync?.ok).toBe(true)
  })

  it("does not reupload completed keys, but sends a task again when it gains a new entry key", async () => {
    const task = makeTask()
    const complete = makeFixture({ uploaded: [task.key, "entry-1"] })
    await runSync(complete.input)
    expect(complete.client.upload).not.toHaveBeenCalled()

    const extended = makeTask({ entries: [...task.entries, { key: "entry-2", start: NOW, end: NOW + 60_000, minutes: 1 }] })
    const fragment = makeFixture({ tasks: [extended], uploaded: [extended.key, "entry-1"] })
    await runSync(fragment.input)
    expect(fragment.client.upload).toHaveBeenCalledOnce()
    expect(fragment.client.upload).toHaveBeenCalledWith(expect.objectContaining({ tasks: [expect.objectContaining({ key: extended.key, entries: [{ key: "entry-2", start: NOW, end: NOW + 60_000, minutes: 1 }] })] }))
  })

  it("records invalid task rejection but leaves unbound tasks unrecorded", async () => {
    const upload = vi.fn(async () => ({
      created: { tasks: 0, entries: 0 },
      skipped: [{ key: "codex:session:d:100", reason: "invalid" }, { key: "codex:unbound:d:1", reason: "unbound" }],
      changesetId: null,
    }) satisfies UploadResponse)
    const fixture = makeFixture({ tasks: [makeTask(), makeTask({ key: "codex:unbound:d:1" })], upload })
    const result = await runSync(fixture.input)
    expect(result).toMatchObject({ uploadedTasks: 0, rejected: 1, skipped: 1 })
    expect(fixture.rejected.get("codex:session:d:100")).toContain("0.1.0")
    expect(fixture.done.has("codex:unbound:d:1")).toBe(false)
  })

  it("splits an HTTP 400 batch into individual requests and rejects only the failing task", async () => {
    const upload = vi.fn(async (request) => {
      if (request.tasks.length > 1) throw new RecorderHttpError(400, "invalid", "batch shape")
      if (request.tasks[0]?.key === "bad") throw new RecorderHttpError(400, "invalid", "bad task")
      return { created: { tasks: 1, entries: 1 }, skipped: [], changesetId: "one" }
    })
    const fixture = makeFixture({ tasks: [makeTask({ key: "good" }), makeTask({ key: "bad" })], upload })
    const result = await runSync(fixture.input)
    expect(upload).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ uploadedTasks: 1, rejected: 1 })
    expect(fixture.done.has("good")).toBe(true)
    expect(fixture.rejected.has("bad")).toBe(true)
  })

  it("stops after authorization failure and does not update live windows", async () => {
    const fixture = makeFixture({ upload: vi.fn(async () => { throw new RecorderHttpError(401, "auth", "token expired") }) })
    const result = await runSync(fixture.input)
    expect(result).toMatchObject({ error: "token expired" })
    expect(fixture.client.putLive).not.toHaveBeenCalled()
    expect(fixture.state.readState(fixture.input.home).lastSync?.ok).toBe(false)
  })

  it("dry-run reports keys without network writes or state mutations", async () => {
    const fixture = makeFixture()
    fixture.input.options = { all: false, dryRun: true }
    const result = await runSync(fixture.input)
    expect(result).toMatchObject({ taskKeys: ["codex:session:d:100"], entryKeys: ["entry-1"] })
    expect(fixture.client.upload).not.toHaveBeenCalled()
    expect(fixture.client.putLive).not.toHaveBeenCalled()
    expect(fixture.uploadedLines).toHaveLength(0)
    expect(fixture.updates).not.toHaveBeenCalled()
    expect(fixture.cache()).toBeNull()
  })

  it("returns immediately when locked and records the exact missing-credentials message", async () => {
    const locked = makeFixture()
    locked.input.state.withLock = vi.fn(async () => null)
    await expect(runSync(locked.input)).resolves.toEqual({ skipped: "locked" })
    expect(locked.client.getBindings).not.toHaveBeenCalled()

    const noCredentials = makeFixture()
    noCredentials.input.creds = null
    const result = await runSync(noCredentials.input)
    expect(result).toMatchObject({ error: "未配置凭据" })
    expect(noCredentials.state.readState(noCredentials.input.home).lastSync).toBeUndefined()
    expect(noCredentials.updates).not.toHaveBeenCalled()
    expect(noCredentials.client.getBindings).not.toHaveBeenCalled()
  })

  it("does not persist refreshed bindings when upload fails", async () => {
    const fixture = makeFixture({ upload: vi.fn(async () => { throw new RecorderHttpError(503, "server", "unavailable") }) })
    const stale: BindingsCache = { fetchedAt: NOW - 6 * 60_000, bindings: [{ dir: "old", projectId: "p", projectName: "Old" }] }
    fixture.input.bindingsCache?.write(fixture.input.home, stale)
    const result = await runSync(fixture.input)
    expect(result).toMatchObject({ error: "unavailable" })
    expect(fixture.cache()).toEqual(stale)
    expect(fixture.readEvents).toHaveBeenCalledWith(fixture.input.home, { now: NOW })
  })

  it("removes the explicit settle reservation path after sleeping", async () => {
    const fixture = makeFixture()
    fixture.input.options.delayMs = 5_000
    fixture.input.options.settleLockPath = join(fixture.input.home, "settle-exact.lock")
    const sleep = vi.fn(async () => undefined)
    const removeSettleLock = vi.fn()
    fixture.input.sleep = sleep
    fixture.input.removeSettleLock = removeSettleLock
    await runSync(fixture.input)
    expect(sleep).toHaveBeenCalledWith(5_000)
    expect(removeSettleLock).toHaveBeenCalledWith(join(fixture.input.home, "settle-exact.lock"))
  })

  it("dry-run without credentials returns an error and does not write state", async () => {
    const fixture = makeFixture()
    fixture.input.creds = null
    fixture.input.options.dryRun = true
    const result = await runSync(fixture.input)
    expect(result).toMatchObject({ error: "未配置凭据" })
    expect(fixture.updates).not.toHaveBeenCalled()
  })

  it("completes an end-to-end sync against a local HTTP server using real fetch", async () => {
    const received: { method: string; path: string; body: string }[] = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8")
        received.push({ method: request.method ?? "", path: request.url ?? "", body })
        response.setHeader("Content-Type", "application/json")
        if (request.url === "/api/recorder/bindings") {
          response.end(JSON.stringify({ bindings: [{ dir: "repo", projectId: "p", projectName: "Project" }] }))
        } else if (request.url === "/api/recorder/upload") {
          response.end(JSON.stringify({ created: { tasks: 1, entries: 1 }, skipped: [], changesetId: "local" }))
        } else if (request.url === "/api/recorder/live") {
          response.statusCode = 204
          response.end()
        } else {
          response.statusCode = 404
          response.end(JSON.stringify({ message: "not found" }))
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address() as AddressInfo
      const fixture = makeFixture({ open: [openWindow] })
      fixture.input.client = createClient({ url: `http://127.0.0.1:${address.port}`, token: "dd_test" })
      const outcome = await runSync(fixture.input)
      expect(outcome).toMatchObject({ uploadedTasks: 1, uploadedEntries: 1, liveSent: true })
      expect(received.map((request) => [request.method, request.path])).toEqual([
        ["GET", "/api/recorder/bindings"],
        ["POST", "/api/recorder/upload"],
        ["PUT", "/api/recorder/live"],
      ])
      expect(JSON.parse(received[1]?.body ?? "{}")).toMatchObject({ tasks: [{ key: "codex:session:d:100" }] })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
