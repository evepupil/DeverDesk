import { beforeEach, describe, expect, it, vi } from "vitest"

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock("@/lib/api", () => ({ request }))

import { RECORDER_PATHS, type LiveResponse } from "@/sync/recorder-protocol"
import { getLiveWindows } from "./recorder-api"

describe("getLiveWindows", () => {
  beforeEach(() => request.mockReset())

  it("requests the typed live recorder endpoint", async () => {
    const response: LiveResponse = { windows: [], updatedAt: 1_798_920_000_000 }
    request.mockResolvedValue(response)

    await expect(getLiveWindows()).resolves.toBe(response)
    expect(request).toHaveBeenCalledExactlyOnceWith(RECORDER_PATHS.live)
  })
})
