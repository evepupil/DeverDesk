import { describe, expect, it } from "vitest"
import { roundEntries } from "./rounding"

describe("roundEntries", () => {
  it("drops segments below 0.5 minutes before largest-remainder allocation", () => {
    const raw = Array.from({ length: 5 }, (_, index) => ({
      start: index * 10 * 60_000,
      end: index * 10 * 60_000 + 10 * 60_000,
      exactMinutes: 0.6,
    }))
    const result = roundEntries(raw, "task", "c:sha")
    expect(result.exactMinutes).toBe(3)
    expect(result.minutes).toBe(3)
    expect(result.entries.map(entry => [entry.start, entry.minutes])).toEqual([
      [0, 1], [10 * 60_000, 1], [20 * 60_000, 1],
    ])
  })

  it("retains an exact half minute and uses stable task/source keys", () => {
    const result = roundEntries([
      { start: 2, end: 30_002, exactMinutes: 0.5 },
      { start: 1, end: 30_001, exactMinutes: 0.5 },
    ], "claude-code:s:c:abc", "c:child")
    expect(result.entries).toEqual([
      { key: "claude-code:s:c:abc#1#c:child", start: 1, end: 30_001, minutes: 1, exactMinutes: 0.5 },
    ])
  })
})
