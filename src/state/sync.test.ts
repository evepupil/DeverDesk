import { afterEach, describe, expect, it, vi } from "vitest"

import { markFirstSyncComplete, stopSync, subscribeFirstSyncComplete } from "./sync"

afterEach(() => stopSync())

describe("first sync completion subscription", () => {
  it("notifies current subscribers once and immediately notifies late subscribers", () => {
    const earlyListener = vi.fn()
    const unsubscribe = subscribeFirstSyncComplete(earlyListener)
    expect(earlyListener).not.toHaveBeenCalled()

    markFirstSyncComplete()
    markFirstSyncComplete()
    expect(earlyListener).toHaveBeenCalledOnce()

    const lateListener = vi.fn()
    subscribeFirstSyncComplete(lateListener)
    expect(lateListener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
