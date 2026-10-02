import { beforeAll, describe, expect, it } from "vitest"

import { LIVE_EXPIRE_MS, type LiveResponse } from "@/sync/recorder-protocol"
import { toLiveWindowRows } from "./live-windows"

beforeAll(() => {
  process.env.TZ = "UTC"
})

const NOW = Date.UTC(2026, 9, 2, 12)

function windowOf(session: string, since: number, minutes: number, projectName = "Studio") {
  return {
    session,
    dir: "studio",
    agent: "codex" as const,
    since,
    minutes,
    projectId: "p1",
    projectName,
  }
}

describe("toLiveWindowRows", () => {
  it("ignores a response older than the live expiration window", () => {
    const response: LiveResponse = {
      windows: [windowOf("old", NOW - 60_000, 12)],
      updatedAt: NOW - LIVE_EXPIRE_MS - 1,
    }

    expect(toLiveWindowRows(response, NOW)).toEqual([])
  })

  it("expires a retained successful response as the clock advances", () => {
    const response: LiveResponse = {
      windows: [windowOf("recent", NOW - 60_000, 12)],
      updatedAt: NOW,
    }

    expect(toLiveWindowRows(response, NOW)).toHaveLength(1)
    expect(toLiveWindowRows(response, NOW + LIVE_EXPIRE_MS + 1)).toEqual([])
  })

  it("sorts by start time and formats the displayed time and minutes", () => {
    const response: LiveResponse = {
      windows: [
        windowOf("later", Date.UTC(2026, 9, 2, 10, 15), 90),
        windowOf("earlier", Date.UTC(2026, 9, 2, 9, 5), 45),
      ],
      updatedAt: NOW,
    }

    expect(toLiveWindowRows(response, NOW).map(({ session, startedAt, formattedMinutes }) => ({
      session,
      startedAt,
      formattedMinutes,
    }))).toEqual([
      { session: "earlier", startedAt: "09:05", formattedMinutes: "45m" },
      { session: "later", startedAt: "10:15", formattedMinutes: "1.5h" },
    ])
  })

  it("keeps multiple active windows for the same project as separate rows", () => {
    const response: LiveResponse = {
      windows: [
        windowOf("second", NOW - 20 * 60_000, 8),
        windowOf("first", NOW - 40 * 60_000, 17),
      ],
      updatedAt: NOW,
    }

    expect(toLiveWindowRows(response, NOW)).toMatchObject([
      { session: "first", projectId: "p1", projectName: "Studio", minutes: 17 },
      { session: "second", projectId: "p1", projectName: "Studio", minutes: 8 },
    ])
  })
})
