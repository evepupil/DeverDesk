import { describe, expect, it, vi } from "vitest"
import { emptyState, type RecorderState } from "../store/state"
import type { OpenWindow } from "../core/types"
import { syncLive } from "./live"

function stateAdapter(initial = emptyState()) {
  let current: RecorderState = initial
  return {
    readState: () => current,
    updateState: async (_home: string, update: (state: RecorderState) => RecorderState | void) => {
      current = update(current) ?? current
      return current
    },
    current: () => current,
  }
}

const windowA: OpenWindow = { session: "s1", dir: "Repo", agent: "codex", since: 100, minutes: 4 }

describe("syncLive", () => {
  it("filters unbound windows and skips an unchanged fingerprint for 60 seconds", async () => {
    const state = stateAdapter()
    const putLive = vi.fn(async () => undefined)
    const input = { home: "/fake", now: 10_000, windows: [windowA, { ...windowA, session: "other", dir: "Elsewhere" }], bindings: [{ dir: "repo" }], client: { putLive }, state }
    await expect(syncLive(input)).resolves.toBe(true)
    expect(putLive).toHaveBeenCalledWith({ windows: [windowA] })
    await expect(syncLive({ ...input, now: 69_999 })).resolves.toBe(false)
    expect(putLive).toHaveBeenCalledOnce()
    await expect(syncLive({ ...input, now: 70_000 })).resolves.toBe(true)
    expect(putLive).toHaveBeenCalledTimes(2)
  })

  it("sends one empty update when the last window disappears and never repeats it", async () => {
    const initial = emptyState()
    initial.lastLive = { at: 1_000, fingerprint: "s1:100:4" }
    const state = stateAdapter(initial)
    const putLive = vi.fn(async () => undefined)
    await expect(syncLive({ home: "/fake", now: 2_000, windows: [], bindings: [{ dir: "Repo" }], client: { putLive }, state })).resolves.toBe(true)
    expect(putLive).toHaveBeenCalledWith({ windows: [] })
    await expect(syncLive({ home: "/fake", now: 2_001, windows: [], bindings: [{ dir: "Repo" }], client: { putLive }, state })).resolves.toBe(false)
    await expect(syncLive({ home: "/fake", now: 62_000, windows: [], bindings: [{ dir: "Repo" }], client: { putLive }, state })).resolves.toBe(false)
    expect(putLive).toHaveBeenCalledOnce()
  })
})
