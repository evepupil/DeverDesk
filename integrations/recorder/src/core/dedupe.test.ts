import { describe, expect, it } from "vitest"
import { dedupeAndSort } from "./dedupe"
import type { CommitEvent, RecorderEvent } from "./types"

const base = { v: 1 as const, agent: "claude-code" as const, session: "s", dir: "repo", cwd: "/repo" }

function commit(t: number, sha: string, subject = "fix"): CommitEvent {
  return { ...base, kind: "commit", t, repo: "r", sha, subject, additions: 1, deletions: 0, files: 1, authoredAt: t }
}

describe("dedupeAndSort", () => {
  it("uses repo and sha for commits and window, kind, time for other events", () => {
    const input: RecorderEvent[] = [
      { ...base, kind: "prompt", t: 10, text: "hello" },
      commit(10, "a"),
      commit(10, "b"),
      { ...commit(10, "a"), subject: "duplicate" },
      { ...base, kind: "prompt", t: 10, text: "different duplicate" },
      { ...base, kind: "stop", t: 10 },
      { ...base, kind: "start", t: 10 },
      { ...base, kind: "end", t: 10 },
      { ...base, kind: "done", t: 10, title: "done" },
    ]
    const ordered = dedupeAndSort(input)
    expect(ordered.map(item => item.kind)).toEqual(["start", "stop", "prompt", "end", "done", "commit", "commit"])
    expect(ordered.filter(item => item.kind === "commit").map(item => item.sha)).toEqual(["a", "b"])
  })

  it("deduplicates commits by case-insensitive directory and sha, independent of repo path", () => {
    const first = { ...commit(10, "same"), dir: "Repo", repo: "/repos/Repo" }
    const duplicate = { ...commit(10, "same"), dir: "repo", repo: "/worktrees/repo" }
    const otherDirectory = { ...commit(10, "same"), dir: "another", repo: "/repos/another" }
    const result = dedupeAndSort([duplicate, otherDirectory, first])
    expect(result.filter(event => event.kind === "commit")).toHaveLength(2)
    expect(result.find(event => event.kind === "commit" && event.dir === "Repo")).toBeDefined()
  })

  it("also deduplicates the same repository and sha when directory metadata differs", () => {
    const first = { ...commit(10, "same"), dir: "alpha", repo: "/repos/shared" }
    const duplicate = { ...commit(10, "same"), dir: "beta", repo: "/repos/shared" }
    const linkedByDirectory = { ...commit(10, "same"), dir: "beta", repo: "/repos/other" }
    const result = dedupeAndSort([linkedByDirectory, duplicate, first])
    const commits = result.filter(event => event.kind === "commit")

    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({ dir: "alpha", repo: "/repos/shared", sha: "same" })
  })

  it("keeps the lexically smallest serialized duplicate and drops malformed rows", () => {
    const promptA = { ...base, kind: "prompt" as const, t: 10, text: "a" }
    const promptZ = { ...base, kind: "prompt" as const, t: 10, text: "z" }
    const missingDir = { ...commit(10, "valid"), dir: undefined, repo: "/repo/.git", additions: Number.NaN, deletions: Number.POSITIVE_INFINITY }
    const invalidRows = [
      { ...promptA, t: Number.NaN },
      { ...promptA, session: "" },
      { ...promptA, dir: "" },
      { ...commit(10, ""), sha: "" },
    ]
    const result = dedupeAndSort([promptZ, promptA, missingDir, ...invalidRows] as unknown as RecorderEvent[])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ kind: "prompt", text: "a" })
    expect(result[1]).toMatchObject({ kind: "commit", dir: "repo", additions: 0, deletions: 0 })
  })

  it("is independent of input order, including same-time distinct commits", () => {
    const events: RecorderEvent[] = [
      { ...base, kind: "prompt", t: 0, text: "hello" },
      { ...base, kind: "stop", t: 10 },
      commit(10, "z"),
      commit(10, "a"),
      { ...base, kind: "done", t: 20, title: "done" },
    ]
    expect(dedupeAndSort([...events].reverse())).toEqual(dedupeAndSort(events))
  })
})
