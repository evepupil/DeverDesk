import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import type { ComputedTask } from "../core/types"
import { buildUploadRequests } from "./build-payload"

function task(index: number, agent: ComputedTask["agent"] = "codex", entries = 0): ComputedTask {
  return {
    key: `task-${index}`,
    agent,
    session: `session-${index}`,
    dir: "Repo",
    source: "done",
    title: `  Coding 10:00–10:30 ${index}  `,
    finishedAt: index,
    commits: Array.from({ length: 22 }, (_, commit) => ({ sha: String(commit).padStart(40, "0"), subject: `commit ${commit}` })),
    entries: Array.from({ length: entries }, (_, entry) => ({
      key: `${index}-${entry}`,
      start: entry * 1000,
      end: entry * 1000 + 500,
      minutes: 2,
    })),
  }
}

const client = { name: "Recorder", version: "0.1.0", agent: "claude-code" as const }

describe("buildUploadRequests", () => {
  it("splits by task count and change count, grouping by each task agent", () => {
    const tasks = [
      ...Array.from({ length: 11 }, (_, index) => task(index)),
      task(12, "claude-code"),
    ]
    const requests = buildUploadRequests(tasks, client)
    expect(requests.map((request) => [request.client.agent, request.tasks.length])).toEqual([
      ["codex", 10], ["codex", 1], ["claude-code", 1],
    ])
    expect(requests[0]?.tasks[0]?.title).toBe("Coding 10:00–10:30 0")
    expect(requests[0]?.tasks[0]?.commits).toHaveLength(20)

    const changeLimited = buildUploadRequests(Array.from({ length: 5 }, (_, index) => task(index, "codex", 14)), client)
    expect(changeLimited.map((request) => request.tasks.length)).toEqual([2, 2, 1])
    expect(changeLimited.every((request) => request.tasks.length + request.tasks.reduce((n, item) => n + item.entries.length, 0) <= 30)).toBe(true)
  })

  it("drops six-character commit ids and accepts the seven-character minimum", () => {
    const input = task(9)
    input.commits = [
      { sha: "a".repeat(6), subject: "too short" },
      { sha: "b".repeat(7), subject: "minimum" },
    ]
    expect(buildUploadRequests([input], client)[0]?.tasks[0]?.commits).toEqual([
      { sha: "b".repeat(7), subject: "minimum" },
    ])
  })

  it("compresses closest adjacent entries without changing their total minutes", () => {
    const input = task(1, "codex", 22)
    input.entries[0] = { key: "a", start: 0, end: 10, minutes: 4 }
    input.entries[1] = { key: "b", start: 11, end: 20, minutes: 3 }
    const requests = buildUploadRequests([input], client)
    const entries = requests[0]?.tasks[0]?.entries ?? []
    expect(entries).toHaveLength(20)
    expect(entries[0]).toEqual({ key: `a+2~${createHash("sha256").update("ab").digest("hex").slice(0, 8)}`, start: 0, end: 20, minutes: 7 })
    expect(entries.reduce((sum, entry) => sum + entry.minutes, 0)).toBe(47)
  })

  it("keeps compressed keys within the server limit for 25 fragmented commit segments", () => {
    const input = task(1, "codex", 25)
    input.commits = Array.from({ length: 25 }, (_, index) => ({ sha: String(index).padStart(40, "0"), subject: `tiny ${index}` }))
    input.entries = input.entries.map((entry, index) => ({ ...entry, key: `entry-${index}-` + "x".repeat(240) }))
    const uploaded = buildUploadRequests([input], client)[0]?.tasks[0]
    expect(uploaded?.commits).toHaveLength(20)
    expect(uploaded?.entries).toHaveLength(20)
    expect(uploaded?.entries.every((entry) => entry.key.length <= 200)).toBe(true)
    expect(uploaded?.entries.reduce((sum, entry) => sum + entry.minutes, 0)).toBe(50)
    expect(uploaded?.entries.some((entry) => /\+\d+~[0-9a-f]{8}$/u.test(entry.key))).toBe(true)
  })

  it("sends only new entry keys for an already-uploaded task", () => {
    const input = task(3)
    input.entries = [
      { key: "old-entry", start: 0, end: 10, minutes: 1 },
      { key: "new-entry", start: 20, end: 30, minutes: 1 },
    ]
    const uploaded = buildUploadRequests([input], client, new Set([input.key, "old-entry"]))[0]?.tasks[0]
    expect(uploaded?.key).toBe(input.key)
    expect(uploaded?.entries).toEqual([{ key: "new-entry", start: 20, end: 30, minutes: 1 }])
  })

  it("normalizes every constrained upload field without splitting surrogate pairs", () => {
    const input = task(4)
    input.key = "😀".repeat(110)
    input.dir = "d".repeat(70)
    input.title = "😀".repeat(45)
    input.taskSeq = 1_000_000
    input.commits = [
      { sha: "bad", subject: "discard" },
      { sha: "a".repeat(40), subject: "x".repeat(199) + "😀" },
    ]
    input.entries = [{ key: "e".repeat(250), start: 0, end: 10, minutes: 1 }]
    const uploaded = buildUploadRequests([input], client)[0]?.tasks[0]
    expect(uploaded?.key.length).toBeLessThanOrEqual(200)
    expect(uploaded?.key.endsWith("\uD83D")).toBe(false)
    expect(uploaded?.dir.length).toBeLessThanOrEqual(60)
    expect(uploaded?.title.length).toBeLessThanOrEqual(80)
    expect(uploaded?.title.endsWith("\uD83D")).toBe(false)
    expect(uploaded?.taskSeq).toBeUndefined()
    expect(uploaded?.commits).toEqual([{ sha: "a".repeat(40), subject: "x".repeat(199) }])
    expect(uploaded?.entries[0]?.key.length).toBeLessThanOrEqual(200)
  })

  it("uses Coding for blank titles and truncates titles at 80 characters", () => {
    const empty = task(1)
    empty.title = "   "
    const long = task(2)
    long.title = "x".repeat(100)
    const requests = buildUploadRequests([empty, long], client)
    expect(requests[0]?.tasks[0]?.title).toBe("Coding")
    expect(requests[0]?.tasks[1]?.title).toBe("x".repeat(80))
  })
})
