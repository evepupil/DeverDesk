import { performance } from "node:perf_hooks"
import { describe, expect, it } from "vitest"
import { computeTasks } from "./engine"
import type { RecorderEvent } from "./types"

const M = 60_000
const baseTime = Date.UTC(2025, 0, 1)
const base = { v: 1 as const, agent: "claude-code" as const, dir: "repo", cwd: "/repo" }

describe("computeTasks performance", () => {
  it("processes 20,000 events across 50 windows within 1,500 ms", () => {
    const events: RecorderEvent[] = []
    for (let window = 0; window < 50; window += 1) {
      const session = `s${window.toString().padStart(2, "0")}`
      for (let round = 0; round < 200; round += 1) {
        const promptAt = baseTime + round * 2 * M
        events.push(
          { ...base, session, kind: "prompt", t: promptAt, text: "work" },
          { ...base, session, kind: "stop", t: promptAt + M },
        )
      }
    }
    const started = performance.now()
    const result = computeTasks(events, baseTime + 401 * M)
    const elapsed = performance.now() - started
    console.info(`computeTasks 20,000 events / 50 windows: ${elapsed.toFixed(1)} ms`)
    expect(result.tasks).toEqual([])
    expect(elapsed).toBeLessThan(1_500)
  })
})
