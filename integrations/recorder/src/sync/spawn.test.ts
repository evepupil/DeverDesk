import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SETTLE_DELAY } from "../core/constants"

const childSpawn = vi.hoisted(() => vi.fn(() => ({
  once: vi.fn<(event: string, listener: (error: Error) => void) => void>(),
  unref: vi.fn(),
})))
vi.mock("node:child_process", () => ({ spawn: childSpawn }))

import { spawnBackgroundSync } from "./spawn"

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.useRealTimers()
  childSpawn.mockClear()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-spawn-"))
  temporaryDirectories.push(directory)
  return directory
}

describe("background sync spawn", () => {
  it("detaches the sync CLI with ignored stdio and inherits the provided environment", () => {
    const home = makeTempDir()
    const env = { DEVERDESK_HOME: home, PATH: "test-path" }
    spawnBackgroundSync("node.exe", "recorder.js", env)
    expect(childSpawn).toHaveBeenCalledWith("node.exe", ["recorder.js", "sync"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env,
      cwd: home,
    })
    expect(childSpawn.mock.results[0]?.value.unref).toHaveBeenCalledOnce()
    expect(readdirSync(home)).toEqual([])
  })

  it("passes a clamped delay and coalesces settle runs due within 30 seconds", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_740_000_000_000)
    const home = makeTempDir()
    const env = { DEVERDESK_HOME: home }
    spawnBackgroundSync("node", "recorder.js", env, { delayMs: SETTLE_DELAY + 5000 })
    spawnBackgroundSync("node", "recorder.js", env, { delayMs: SETTLE_DELAY + 5020 })
    expect(childSpawn).toHaveBeenCalledOnce()
    expect(childSpawn).toHaveBeenCalledWith("node", ["recorder.js", "sync", "--delay", String(SETTLE_DELAY + 5000)], expect.objectContaining({
      detached: true,
      env: expect.objectContaining({ DEVERDESK_RECORDER_SETTLE_LOCK: join(home, `settle-${1_740_000_000_000 + SETTLE_DELAY + 5000}.lock`) }),
    }))
    expect(readdirSync(home).filter((name) => /^settle-\d+\.lock$/.test(name))).toHaveLength(1)

    spawnBackgroundSync("node", "recorder.js", env, { delayMs: SETTLE_DELAY + 40_000 })
    expect(childSpawn).toHaveBeenCalledTimes(2)
  })

  it("releases the settle reservation and reports asynchronous spawn errors", () => {
    vi.useFakeTimers()
    const now = 1_740_000_000_000
    vi.setSystemTime(now)
    const home = makeTempDir()
    const onError = vi.fn()
    spawnBackgroundSync("missing-node", "recorder.js", { DEVERDESK_HOME: home }, { delayMs: 5000, onError })
    const reservation = join(home, `settle-${now + 5000}.lock`)
    expect(existsSync(reservation)).toBe(true)

    const child = childSpawn.mock.results[0]?.value
    const onSpawnError = child?.once.mock.calls[0]?.[1]
    expect(onSpawnError).toBeTypeOf("function")
    onSpawnError?.(new Error("ENOENT"))
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "ENOENT" }))
    expect(existsSync(reservation)).toBe(false)
  })

  it("recovers stale gate locks and prunes expired settle reservations", () => {
    vi.useFakeTimers()
    const now = 1_740_000_000_000
    vi.setSystemTime(now)
    const home = makeTempDir()
    const env = { DEVERDESK_HOME: home }
    const staleGate = join(home, "settle-index.lock")
    writeFileSync(staleGate, "orphan")
    const stale = new Date(now - 20_000)
    utimesSync(staleGate, stale, stale)
    const expiredDue = now - 6 * 60_000
    const expiredReservation = join(home, `settle-${expiredDue}.lock`)
    writeFileSync(expiredReservation, "old")

    spawnBackgroundSync("node", "recorder.js", env, { delayMs: 5000 })
    expect(childSpawn).toHaveBeenCalledOnce()
    expect(existsSync(staleGate)).toBe(false)
    expect(existsSync(expiredReservation)).toBe(false)
    expect(readdirSync(home).filter((name) => /^settle-\d+\.lock$/.test(name))).toHaveLength(1)
  })

  it("caps requested delays at twenty minutes", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_740_000_000_000)
    const home = makeTempDir()
    spawnBackgroundSync("node", "recorder.js", { DEVERDESK_HOME: home }, { delayMs: 99 * 60_000 })
    expect(childSpawn).toHaveBeenCalledWith("node", ["recorder.js", "sync", "--delay", String(20 * 60_000)], expect.objectContaining({
      env: expect.objectContaining({ DEVERDESK_RECORDER_SETTLE_LOCK: join(home, `settle-${1_740_000_000_000 + 20 * 60_000}.lock`) }),
    }))
  })
})
