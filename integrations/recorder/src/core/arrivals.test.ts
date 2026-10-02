import { describe, expect, it } from "vitest"
import { IDLE_ARRIVAL } from "./constants"
import { computeTasks } from "./engine"

const baseTime = Date.UTC(2025, 0, 1)

describe("idle arrivals", () => {
  it("waits for the idle boundary, then timestamps the later counted-segment end", () => {
    const events = [{
      v: 1 as const,
      agent: "claude-code" as const,
      session: "S",
      dir: "repo",
      cwd: "/repo",
      kind: "prompt" as const,
      t: baseTime,
      text: "Write stable tests",
    }]
    const before = computeTasks(events, baseTime + IDLE_ARRIVAL - 1)
    expect(before.tasks).toEqual([])
    const settled = computeTasks(events, baseTime + IDLE_ARRIVAL)
    expect(settled.tasks).toEqual([{
      key: `claude-code:S:i:${baseTime + 15 * 60_000}`,
      agent: "claude-code",
      session: "S",
      dir: "repo",
      source: "idle",
      title: "Write stable tests",
      finishedAt: baseTime + 15 * 60_000,
      commits: [],
      entries: [{
        key: `claude-code:S:i:${baseTime + 15 * 60_000}#${baseTime}#i:${baseTime + 15 * 60_000}`,
        start: baseTime,
        end: baseTime + 15 * 60_000,
        minutes: 15,
      }],
    }])
  })
})
