import { describe, expect, it } from "vitest"
import { assignCommits, commitIdentity } from "./attribution"
import { groupWindows } from "./presence"
import { dedupeAndSort } from "./dedupe"
import type { CommitEvent, RecorderEvent } from "./types"

const base = { v: 1 as const, agent: "claude-code" as const, dir: "repo", cwd: "/repo" }
const M = 60_000

function prompt(session: string, t: number, dir = "repo"): RecorderEvent {
  return { ...base, session, dir, kind: "prompt", t, text: "work" }
}
function stop(session: string, t: number, dir = "repo"): RecorderEvent {
  return { ...base, session, dir, kind: "stop", t }
}
function end(session: string, t: number, dir = "repo"): RecorderEvent {
  return { ...base, session, dir, kind: "end", t }
}
function commit(t: number, session = "hook-session", dir = "repo"): CommitEvent {
  return { ...base, session, dir, kind: "commit", t, repo: "/repo", sha: `sha-${t}`, subject: "fix: work", additions: 1, deletions: 0, files: 1, authoredAt: t }
}

describe("assignCommits", () => {
  it("prefers the most recent prompt window even when another window just stopped", () => {
    const events = dedupeAndSort([prompt("A", 0), prompt("B", 0), stop("B", 5 * M), commit(6 * M, "B")])
    const windows = groupWindows(events)
    const found = assignCommits(windows, [commit(6 * M, "B")]).get(commitIdentity(commit(6 * M, "B")))
    expect(found?.session).toBe("A")
  })

  it("breaks equal prompt times by the lexically smaller session", () => {
    const events = dedupeAndSort([prompt("z", 0), prompt("a", 0)])
    const windows = groupWindows(events)
    expect(assignCommits(windows, [commit(M)]).values().next().value?.session).toBe("a")
  })

  it("falls back to the nearest recent stop or end and enforces the strict gap", () => {
    const events = dedupeAndSort([stop("A", 0), end("B", 5 * M)])
    const windows = groupWindows(events)
    expect(assignCommits(windows, [commit(10 * M)]).values().next().value?.session).toBe("B")
    expect(assignCommits(windows, [commit(20 * M)]).size).toBe(0)
  })

  it("requires a case-insensitive directory match and ignores the hook session", () => {
    const events = dedupeAndSort([prompt("owner", 0, "Repo"), prompt("other", 0, "elsewhere")])
    const windows = groupWindows(events)
    const found = assignCommits(windows, [commit(M, "other", "repo")])
    expect([...found.values()].map(window => window.session)).toEqual(["owner"])
    expect(assignCommits(windows, [commit(M, "owner", "unrelated")]).size).toBe(0)
  })

  it("does not consider evidence at the exact commit timestamp to be earlier", () => {
    const events = dedupeAndSort([prompt("A", M)])
    expect(assignCommits(groupWindows(events), [commit(M)]).size).toBe(0)
  })
})
