import { describe, expect, it } from "vitest"
import { buildPresenceIntervals, groupWindows } from "./presence"
import { dedupeAndSort } from "./dedupe"
import type { RecorderEvent } from "./types"

const M = 60_000
const base = { v: 1 as const, agent: "claude-code" as const, session: "s", dir: "repo", cwd: "/repo" }

function prompt(t: number): RecorderEvent { return { ...base, kind: "prompt", t, text: "work" } }
function stop(t: number): RecorderEvent { return { ...base, kind: "stop", t } }
function end(t: number): RecorderEvent { return { ...base, kind: "end", t } }

describe("buildPresenceIntervals", () => {
  it("caps prompt-only work at 15 minutes", () => {
    const events = dedupeAndSort([prompt(0), stop(40 * M), end(40 * M)])
    expect([...buildPresenceIntervals(groupWindows(events), 60 * M).values()]).toEqual([[{ start: 0, end: 15 * M }]])
  })

  it("uses strict PRESENCE_GAP boundaries", () => {
    const before = dedupeAndSort([stop(0), prompt(15 * M - 1), end(15 * M - 1)])
    const at = dedupeAndSort([stop(0), prompt(15 * M), end(15 * M)])
    expect([...buildPresenceIntervals(groupWindows(before), 40 * M).values()]).toEqual([[{ start: 0, end: 15 * M - 1 }]])
    expect([...buildPresenceIntervals(groupWindows(at), 40 * M).values()]).toEqual([[]])
  })

  it("does not bridge stop-to-stop but resumes at a later prompt", () => {
    const events = dedupeAndSort([stop(10 * M), stop(25 * M), prompt(30 * M), stop(35 * M), end(35 * M)])
    expect([...buildPresenceIntervals(groupWindows(events), 50 * M).values()]).toEqual([[{ start: 25 * M, end: 35 * M }]])
  })

  it("keeps the first event's directory for the whole window", () => {
    const events = dedupeAndSort([
      { ...base, kind: "prompt", t: 0, text: "" },
      { ...base, dir: "nested", cwd: "/repo/nested", kind: "stop", t: M },
    ])
    expect([...groupWindows(events).values()][0]?.dir).toBe("repo")
  })
})
