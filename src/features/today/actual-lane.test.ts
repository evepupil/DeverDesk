import { describe, expect, it } from "vitest"

import type { TimeEntry } from "@/domain/types"
import type { LiveWindowRow } from "./live-windows"
import { findActualLaneBarsAtY, layoutActualLane, type ActualLaneBar } from "./actual-lane"

const START = Date.UTC(2026, 9, 2, 8)
const NOW = START + 3 * 60 * 60_000

function entry(id: string, start: number, end: number, minutes?: number): TimeEntry {
  return { id, taskId: `task-${id}`, projectId: "p1", start, end, minutes }
}

function live(session: string, since: number, minutes: number): LiveWindowRow {
  return {
    session,
    dir: "studio",
    agent: "codex",
    since,
    minutes,
    projectId: "p1",
    projectName: "Studio",
    startedAt: "09:00",
    formattedMinutes: `${minutes}m`,
  }
}

describe("layoutActualLane", () => {
  it("converts real start and end timestamps to timeline positions", () => {
    expect(layoutActualLane([entry("one", START + 30 * 60_000, START + 90 * 60_000, 47)], [], START, NOW, NOW)).toEqual([
      {
        id: "one",
        source: "entry",
        top: 30,
        height: 60,
        lane: 0,
        lanes: 1,
        minutes: 47,
        ongoing: false,
      },
    ])
  })

  it("places overlapping entries side by side", () => {
    const bars = layoutActualLane([
      entry("one", START, START + 90 * 60_000),
      entry("two", START + 30 * 60_000, START + 120 * 60_000),
    ], [], START, NOW, NOW)

    expect(bars.map(({ id, lane, lanes }) => ({ id, lane, lanes }))).toEqual([
      { id: "one", lane: 0, lanes: 2 },
      { id: "two", lane: 1, lanes: 2 },
    ])
  })

  it("draws a live window from its start through the current time", () => {
    const bars = layoutActualLane([], [live("session", START + 45 * 60_000, 32)], START, START + 5 * 60 * 60_000, NOW)

    expect(bars).toMatchObject([{ id: "session", top: 45, height: 135, minutes: 32, ongoing: true }])
  })

  it("clips bars to the visible range before laying them out", () => {
    const bars = layoutActualLane([
      entry("before", START - 30 * 60_000, START + 20 * 60_000),
      entry("after", START + 3 * 60 * 60_000, START + 4 * 60 * 60_000),
    ], [], START, START + 3 * 60 * 60_000, NOW)

    expect(bars.map(({ id, top, height }) => ({ id, top, height }))).toEqual([
      { id: "before", top: 0, height: 20 },
    ])
  })

  it("returns no bars for empty input or an invalid visible range", () => {
    expect(layoutActualLane([], [], START, NOW, NOW)).toEqual([])
    expect(layoutActualLane([entry("one", START, NOW)], [], NOW, START, NOW)).toEqual([])
  })
})

describe("findActualLaneBarsAtY", () => {
  const bar = (id: string, top: number, height: number): ActualLaneBar => ({
    id,
    source: "entry",
    top,
    height,
    lane: 0,
    lanes: 1,
    minutes: height,
    ongoing: false,
  })

  it("includes both the top and bottom boundaries", () => {
    const item = bar("one", 10, 5)

    expect(findActualLaneBarsAtY([item], 10, 1)).toEqual([item])
    expect(findActualLaneBarsAtY([item], 15, 1)).toEqual([item])
    expect(findActualLaneBarsAtY([item], 15.01, 1)).toEqual([])
  })

  it("returns every overlapping bar in start-time order", () => {
    const later = bar("later", 5, 10)
    const earlier = bar("earlier", 0, 10)

    expect(findActualLaneBarsAtY([later, earlier], 7, 1)).toEqual([earlier, later])
  })

  it("uses the rendered 2px minimum height", () => {
    const short = bar("short", 10, 0.5)

    expect(findActualLaneBarsAtY([short], 11.9, 1)).toEqual([short])
    expect(findActualLaneBarsAtY([short], 12.01, 1)).toEqual([])
  })

  it("returns no bars for empty input or an uncovered position", () => {
    expect(findActualLaneBarsAtY([], 10, 1)).toEqual([])
    expect(findActualLaneBarsAtY([bar("one", 10, 5)], 9.99, 1)).toEqual([])
  })
})
