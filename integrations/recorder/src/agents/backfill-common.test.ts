import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { commitsBySession, firstBackfillSentence, readJsonlLines, type BackfillSession } from "./backfill-common"
import type { CommitInfo } from "../core/types"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-backfill-common-"))
  temporaryDirectories.push(directory)
  return directory
}

describe("backfill common helpers", () => {
  it("reads UTF-8 lines with LF, CRLF, and a final line without a newline", async () => {
    const filePath = join(makeTempDir(), "lines.jsonl")
    writeFileSync(filePath, "one\r\ntwo\nthree", "utf8")
    const lines: string[] = []
    for await (const line of readJsonlLines(filePath)) lines.push(line)
    expect(lines).toEqual(["one", "two", "three"])
  })

  it("extracts and caps the first sentence", () => {
    expect(firstBackfillSentence("  First sentence. Second sentence!  ", 120)).toBe("First sentence.")
    expect(firstBackfillSentence("First line\nSecond line.", 120)).toBe("First line")
    expect(firstBackfillSentence("A very long synthetic sentence without punctuation", 12)).toBe("A very long")
    expect(firstBackfillSentence("   ", 120)).toBe("")
  })

  it("queries one repository once and attributes overlapping commits only to the latest session", async () => {
    const startA = Date.parse("2025-02-01T10:00:00.000Z")
    const startB = Date.parse("2025-02-01T10:20:00.000Z")
    const endA = Date.parse("2025-02-01T10:30:00.000Z")
    const endB = Date.parse("2025-02-01T10:40:00.000Z")
    const sessions: BackfillSession[] = [
      { session: "a", cwd: "/repo/a", dir: "a", repo: "/repo", startAt: startA, activityEndAt: endA },
      { session: "b", cwd: "/repo/b", dir: "b", repo: "/repo", startAt: startB, activityEndAt: endB },
      { session: "c", cwd: "/repo/c", dir: "c", repo: "/repo", startAt: Date.parse("2025-02-01T11:00:00.000Z"), activityEndAt: Date.parse("2025-02-01T11:10:00.000Z") },
      { session: "non-git", cwd: "/elsewhere", dir: "elsewhere", startAt: startA, activityEndAt: startB },
    ]
    const commits: CommitInfo[] = [
      { sha: "only-a", committedAt: Date.parse("2025-02-01T10:10:00.000Z"), authoredAt: 1, authorEmail: "", subject: "A", body: "", additions: 0, deletions: 0, files: 0 },
      { sha: "overlap", committedAt: Date.parse("2025-02-01T10:25:00.000Z"), authoredAt: 2, authorEmail: "", subject: "B", body: "", additions: 0, deletions: 0, files: 0 },
      { sha: "overlap", committedAt: Date.parse("2025-02-01T10:25:00.000Z"), authoredAt: 2, authorEmail: "", subject: "B duplicate", body: "", additions: 0, deletions: 0, files: 0 },
      { sha: "interval-end", committedAt: Date.parse("2025-02-01T10:55:00.000Z"), authoredAt: 3, authorEmail: "", subject: "End", body: "", additions: 0, deletions: 0, files: 0 },
      { sha: "outside", committedAt: Date.parse("2025-02-01T10:56:00.000Z"), authoredAt: 4, authorEmail: "", subject: "Outside", body: "", additions: 0, deletions: 0, files: 0 },
    ]
    const findCommits = vi.fn(async () => commits)
    const attributed = await commitsBySession(sessions, findCommits, startA, Date.parse("2025-02-01T11:30:00.000Z"))
    expect(findCommits).toHaveBeenCalledOnce()
    expect(findCommits).toHaveBeenCalledWith("/repo", startA, Date.parse("2025-02-01T11:25:00.000Z"))
    expect(attributed.map(({ session, commit }) => [session, commit.sha])).toEqual([
      ["a", "only-a"],
      ["b", "overlap"],
      ["b", "interval-end"],
      ["", "outside"],
    ])
    expect(attributed.find(({ commit }) => commit.sha === "outside")).toMatchObject({ dir: "b", cwd: "/repo/b" })
  })

  it("includes a commit at since and excludes one at until", async () => {
    const start = Date.parse("2025-02-01T10:00:00.000Z")
    const intervalEnd = Date.parse("2025-02-01T10:45:00.000Z")
    const since = Date.parse("2025-02-01T10:10:00.000Z")
    const until = Date.parse("2025-02-01T10:20:00.000Z")
    const session: BackfillSession = {
      session: "single",
      cwd: "/repo/work",
      dir: "work",
      repo: "/repo",
      startAt: start,
      activityEndAt: intervalEnd - 15 * 60_000,
    }
    const makeCommit = (sha: string, committedAt: number): CommitInfo => ({
      sha,
      committedAt,
      authoredAt: committedAt,
      authorEmail: "",
      subject: sha,
      body: "",
      additions: 0,
      deletions: 0,
      files: 0,
    })
    const findCommits = vi.fn(async () => [makeCommit("at-since", since), makeCommit("at-until", until)])
    const attributed = await commitsBySession([session], findCommits, since, until)
    expect(findCommits).toHaveBeenCalledOnce()
    expect(findCommits).toHaveBeenCalledWith("/repo", since, until)
    expect(attributed.map(({ session: owner, commit }) => [owner, commit.sha])).toEqual([["single", "at-since"]])
  })
})
