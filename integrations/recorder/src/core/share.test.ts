import { describe, expect, it } from "vitest"
import { exactMinutesBetween, splitAndShare } from "./share"
import type { TimeInterval } from "./presence"

function total(runs: ReturnType<typeof splitAndShare> extends Map<string, infer V> ? V : never): number {
  return runs.reduce((sum, run) => sum + run.exactMinutes, 0)
}

describe("splitAndShare", () => {
  it("splits two overlapping windows into continuous runs", () => {
    const intervals = new Map<string, TimeInterval[]>([
      ["claude-code|A", [{ start: 0, end: 20 * 60_000 }]],
      ["codex|B", [{ start: 5 * 60_000, end: 25 * 60_000 }]],
    ])
    const shared = splitAndShare(intervals)
    const a = shared.get("claude-code|A") ?? []
    const b = shared.get("codex|B") ?? []
    expect(a.map(run => [run.start, run.end])).toEqual([[0, 20 * 60_000]])
    expect(b.map(run => [run.start, run.end])).toEqual([[5 * 60_000, 25 * 60_000]])
    expect(total(a)).toBe(12.5)
    expect(total(b)).toBe(12.5)
    expect(total(a) + total(b)).toBe(25)
    expect(exactMinutesBetween(a[0]!, 5 * 60_000, 20 * 60_000)).toBe(7.5)
  })

  it("shares triple overlap and conserves the union duration", () => {
    const intervals = new Map<string, TimeInterval[]>([
      ["A", [{ start: 0, end: 10 * 60_000 }]],
      ["B", [{ start: 0, end: 8 * 60_000 }]],
      ["C", [{ start: 2 * 60_000, end: 10 * 60_000 }]],
    ])
    const shared = splitAndShare(intervals)
    const totals = [...shared.values()].map(total)
    expect(totals).toEqual([4, 3, 3])
    expect(totals.reduce((sum, value) => sum + value, 0)).toBe(10)
    const activeAtThree = [...shared.values()].flatMap(runs => runs.flatMap(run => run.fragments))
      .filter(fragment => fragment.start <= 3 * 60_000 && fragment.end >= 4 * 60_000)
    expect(activeAtThree).toHaveLength(3)
    expect(activeAtThree.reduce((sum, fragment) => sum + fragment.exactMinutes / ((fragment.end - fragment.start) / 60_000), 0)).toBe(1)
  })
})
