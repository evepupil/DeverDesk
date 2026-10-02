import { describe, expect, it } from "vitest"
import { computeTasks } from "./engine"
import { AI_ALONE_CAP, BURST_GAP, MERGE_WINDOW, PRESENCE_GAP, SETTLE_DELAY } from "./constants"
import type { CommitEvent, RecorderEvent } from "./types"

const M = 60_000
const t0 = Date.UTC(2025, 0, 2, 0, 0)
const base = { v: 1 as const, agent: "claude-code" as const, dir: "repo", cwd: "/repo" }

function prompt(session: string, minute: number, text = "", dir = "repo"): RecorderEvent {
  return { ...base, session, dir, cwd: `/${dir}`, kind: "prompt", t: t0 + minute * M, text }
}
function stop(session: string, minute: number, dir = "repo"): RecorderEvent {
  return { ...base, session, dir, cwd: `/${dir}`, kind: "stop", t: t0 + minute * M }
}
function end(session: string, minute: number, dir = "repo"): RecorderEvent {
  return { ...base, session, dir, cwd: `/${dir}`, kind: "end", t: t0 + minute * M }
}
function done(session: string, minute: number, title: string): RecorderEvent {
  return { ...base, session, kind: "done", t: t0 + minute * M, title }
}
function start(session: string, minute = 0): RecorderEvent {
  return { ...base, session, kind: "start", t: t0 + minute * M }
}
function commit(
  session: string,
  minute: number,
  sha: string,
  additions = 1,
  deletions = 0,
  subject = `fix: ${sha}`,
  dir = "repo",
): CommitEvent {
  const t = t0 + minute * M
  return { ...base, session, dir, cwd: `/${dir}`, kind: "commit", t, repo: "/repo/.git", sha, subject, additions, deletions, files: 1, authoredAt: t }
}
function shaCommit(
  session: string,
  t: number,
  sha: string,
  additions = 1,
  deletions = 0,
  subject = `fix: ${sha}`,
): CommitEvent {
  return { ...base, session, kind: "commit", t, repo: "/repo/.git", sha, subject, additions, deletions, files: 1, authoredAt: t }
}

const late = (minute: number) => t0 + minute * M + 60 * M

describe("computeTasks", () => {
  it("matches the documented two-task example and keeps the idle gap out", () => {
    const events: RecorderEvent[] = [
      prompt("S", 0), stop("S", 14), prompt("S", 20),
      commit("S", 31, "a1", 40, 10, "feat: 支付回调失败自动重试"), stop("S", 31),
      prompt("S", 101, "排查构建变慢。其他内容"), stop("S", 115), end("S", 125),
    ]
    const { tasks } = computeTasks(events, late(130))
    expect(tasks).toHaveLength(2)
    expect(tasks.map(task => [task.source, task.title, task.finishedAt, task.entries.map(entry => [entry.start, entry.end, entry.minutes])])).toEqual([
      ["commit", "支付回调失败自动重试", t0 + 31 * M, [[t0, t0 + 31 * M, 31]]],
      ["end", "排查构建变慢", t0 + 125 * M, [[t0 + 101 * M, t0 + 125 * M, 24]]],
    ])
  })

  it("settles only at the exact delay and leaves settled fields unchanged", () => {
    const events = [prompt("S", 0), stop("S", 10), end("S", 10)]
    const arrival = t0 + 10 * M
    const before = computeTasks(events, arrival + SETTLE_DELAY - 1)
    const at = computeTasks(events, arrival + SETTLE_DELAY)
    expect(before.tasks).toEqual([])
    expect(at.tasks).toHaveLength(1)
    expect(at.tasks[0]).toEqual({
      key: "claude-code:S:e:1735776600000",
      agent: "claude-code",
      session: "S",
      dir: "repo",
      source: "end",
      title: "Coding 00:00–00:10",
      finishedAt: arrival,
      commits: [],
      entries: [{
        key: `claude-code:S:e:${arrival}#${t0}#e:${arrival}`,
        start: t0,
        end: arrival,
        minutes: 10,
      }],
    })
  })

  it("does not count AI work beyond the 15-minute cap", () => {
    const events = [prompt("S", 0), stop("S", 40), done("S", 40, "done")]
    const result = computeTasks(events, late(50))
    expect(result.tasks[0]?.entries).toEqual([{
      key: `claude-code:S:d:${t0 + 40 * M}#${t0}#d:${t0 + 40 * M}`,
      start: t0,
      end: t0 + AI_ALONE_CAP,
      minutes: 15,
    }])
  })

  it("splits overlapping windows exactly, then rounds each task to 13 minutes", () => {
    const events = [
      prompt("A", 0), stop("A", 10), prompt("A", 10), stop("A", 20), end("A", 20),
      prompt("B", 5), stop("B", 15), prompt("B", 15), stop("B", 25), end("B", 25),
    ]
    const { tasks } = computeTasks(events, late(30))
    expect(tasks.map(task => [task.session, task.entries.map(entry => [entry.start, entry.end]), task.entries.reduce((sum, entry) => sum + entry.minutes, 0)])).toEqual([
      ["A", [[t0, t0 + 20 * M]], 13],
      ["B", [[t0 + 5 * M, t0 + 25 * M]], 13],
    ])

    const triple = computeTasks([
      prompt("A", 0), stop("A", 10), end("A", 10),
      prompt("B", 0), stop("B", 10), end("B", 10),
      prompt("C", 0), stop("C", 10), end("C", 10),
    ], late(20))
    expect(triple.tasks.map(task => task.entries.reduce((sum, entry) => sum + entry.minutes, 0))).toEqual([3, 3, 3])
    expect(triple.tasks.reduce((sum, task) => sum + task.entries.reduce((entrySum, entry) => entrySum + entry.minutes, 0), 0)).toBe(9)
  })

  it("allocates burst time by row weights and uses source markers for merged entries", () => {
    const burst = (weights: number[]) => [
      prompt("S", 0), stop("S", 14), prompt("S", 20), stop("S", 31),
      ...weights.map((weight, index) => shaCommit("hook-session", t0 + (31 * M) + index * 30_000, `sha${index + 1}`, weight, 0)),
    ]
    const separate = computeTasks(burst([60, 30, 10]), t0 + 60 * M).tasks
    expect(separate.map(task => [task.key, task.entries.map(entry => entry.key), task.entries[0]?.minutes])).toEqual([
      [`claude-code:S:c:sha1`, [`claude-code:S:c:sha1#${t0}#c:sha1`], 19],
      [`claude-code:S:c:sha2`, [`claude-code:S:c:sha2#${t0}#c:sha2`], 9],
      [`claude-code:S:c:sha3`, [`claude-code:S:c:sha3#${t0}#c:sha3`], 3],
    ])

    const merged = computeTasks(burst([60, 35, 5]), t0 + 60 * M).tasks
    expect(merged).toHaveLength(2)
    expect(merged[0]?.entries[0]?.minutes).toBe(19)
    expect(merged[1]?.commits.map(item => item.sha)).toEqual(["sha2", "sha3"])
    expect(merged[1]?.entries.map(entry => entry.key)).toEqual([
      `claude-code:S:c:sha2#${t0}#c:sha2`,
      `claude-code:S:c:sha2#${t0}#c:sha3`,
    ])
    expect(new Set(merged.flatMap(task => task.entries.map(entry => entry.key))).size).toBe(3)

    const tiny = computeTasks([
      prompt("S", 0), stop("S", 10),
      commit("S", 10, "large", 300, 0),
      commit("S", 10, "tiny-a", 5, 0),
      commit("S", 10, "tiny-b", 5, 0),
    ], late(40)).tasks
    expect(tiny).toHaveLength(1)
    expect(tiny[0]?.commits.map(item => item.sha)).toEqual(["large", "tiny-a", "tiny-b"])
    expect(tiny[0]?.entries.map(entry => entry.key)).toEqual([`claude-code:S:c:large#${t0}#c:large`])
    expect(tiny[0]?.entries.every(entry => entry.minutes >= 1)).toBe(true)
  })

  it("merges tiny commits only through the merge boundary and applies standalone thresholds", () => {
    const firstAt = t0 + 16 * M
    const secondAt = firstAt + MERGE_WINDOW
    const make = (delta: number) => [
      prompt("S", 0),
      shaCommit("S", firstAt, "first", 10),
      stop("S", 116), stop("S", 135), stop("S", secondAt + delta - M),
      shaCommit("S", secondAt + delta, "tiny", 1),
    ]
    const inside = computeTasks(make(0), secondAt + SETTLE_DELAY + M).tasks
    expect(inside).toHaveLength(1)
    expect(inside[0]?.commits.map(item => item.sha)).toEqual(["first", "tiny"])
    const outside = computeTasks(make(1), secondAt + SETTLE_DELAY + M).tasks
    expect(outside).toHaveLength(1)
    expect(outside[0]?.commits.map(item => item.sha)).toEqual(["first"])

    const sixTenths = computeTasks([prompt("S", 0), stop("S", 0.6), commit("S", 0.6, "small")], late(20)).tasks
    expect(sixTenths).toEqual([])
    const oneMinute = computeTasks([prompt("S", 0), stop("S", 1), commit("S", 1, "standalone")], late(20)).tasks
    expect(oneMinute).toHaveLength(1)
    expect(oneMinute[0]?.entries[0]?.minutes).toBe(1)
  })

  it("keeps taskSeq commits independent at zero time and lets done merge tiny time", () => {
    const referenced = computeTasks([
      prompt("S", 0),
      shaCommit("S", t0 + 1, "ref", 0, 0, "feat: x (Closes T-123)"),
    ], late(2)).tasks
    expect(referenced).toHaveLength(1)
    expect(referenced[0]?.taskSeq).toBe(123)
    expect(referenced[0]?.entries).toEqual([])

    const startOnly = computeTasks([start("empty"), done("empty", 2, "reported title")], late(10)).tasks
    expect(startOnly.map(task => [task.source, task.title, task.entries])).toEqual([["done", "reported title", []]])

    const merged = computeTasks([
      prompt("S", 0), commit("S", 10, "base"), done("S", 11, "do not replace"),
    ], late(20)).tasks
    expect(merged).toHaveLength(1)
    expect(merged[0]?.title).toBe("base")
    expect(merged[0]?.finishedAt).toBe(t0 + 10 * M)
    expect(merged[0]?.entries.map(entry => entry.key)).toEqual([
      `claude-code:S:c:base#${t0}#c:base`,
      `claude-code:S:c:base#${t0 + 10 * M}#d:${t0 + 11 * M}`,
    ])
  })

  it("handles idle arrivals and folds sub-threshold end events", () => {
    const idle = computeTasks([prompt("S", 0), stop("S", 10)], t0 + 200 * M).tasks
    expect(idle.map(task => [task.source, task.finishedAt, task.entries])).toEqual([[
      "idle", t0 + 10 * M,
      [{ key: `claude-code:S:i:${t0 + 10 * M}#${t0}#i:${t0 + 10 * M}`, start: t0, end: t0 + 10 * M, minutes: 10 }],
    ]])

    const twoRuns = computeTasks([
      prompt("S", 0), stop("S", 10), prompt("S", 110), stop("S", 120), end("S", 120),
    ], late(130)).tasks
    expect(twoRuns[0]?.source).toBe("end")
    expect(twoRuns[0]?.entries.map(entry => [entry.start, entry.end])).toEqual([
      [t0, t0 + 10 * M], [t0 + 110 * M, t0 + 120 * M],
    ])

    const resumed = computeTasks([
      stop("S", 10), end("S", 10), prompt("S", 12), stop("S", 20), end("S", 20),
    ], late(40)).tasks
    expect(resumed).toHaveLength(1)
    expect(resumed[0]?.source).toBe("end")
    expect(resumed[0]?.finishedAt).toBe(t0 + 20 * M)
    expect(resumed[0]?.entries).toEqual([{
      key: `claude-code:S:e:${t0 + 20 * M}#${t0 + 10 * M}#e:${t0 + 20 * M}`,
      start: t0 + 10 * M,
      end: t0 + 20 * M,
      minutes: 10,
    }])
  })

  it("drops commits before the first counted segment and assigns by activity, not hook session", () => {
    const oldCommit = computeTasks([
      stop("S", 0), commit("S", 10, "old"), prompt("S", 15), stop("S", 25), end("S", 25),
    ], late(40)).tasks
    expect(oldCommit.map(task => task.source)).toEqual(["end"])
    expect(oldCommit.every(task => task.entries.every(entry => entry.minutes >= 1))).toBe(true)

    const assigned = computeTasks([
      prompt("A", 0), prompt("B", 0), stop("B", 1), stop("A", 2),
      commit("B", 2, "owner"), end("A", 2),
    ], late(30)).tasks
    expect(assigned.map(task => task.session)).toContain("A")
    expect(assigned.find(task => task.source === "commit")?.session).toBe("A")
  })

  it("returns current windows with capped or provisional tails, split in parallel", () => {
    expect(computeTasks([prompt("A", 0)], t0 + 10 * M).open).toEqual([
      { session: "A", dir: "repo", agent: "claude-code", since: t0, minutes: 10 },
    ])
    expect(computeTasks([prompt("A", 0)], t0 + 15 * M).open).toEqual([])
    expect(computeTasks([end("E", 0)], t0 + 5 * M).open).toEqual([
      { session: "E", dir: "repo", agent: "claude-code", since: t0, minutes: 5 },
    ])
    expect(computeTasks([start("only-start")], t0 + 5 * M).open).toEqual([])
    expect(computeTasks([prompt("A", 0), prompt("B", 5)], t0 + 10 * M).open.map(item => [item.session, item.since, item.minutes])).toEqual([
      ["A", t0, 8], ["B", t0 + 5 * M, 3],
    ])
  })

  it("rounds an exact half-minute upward", () => {
    const arrival = t0 + 2.5 * M
    const tasks = computeTasks([
      prompt("S", 0), stop("S", 2.5), shaCommit("S", arrival, "half", 1, 0, "fix: x (Closes T-1)"),
    ], arrival + SETTLE_DELAY).tasks
    expect(tasks[0]?.entries).toEqual([{
      key: `claude-code:S:c:half#${t0}#c:half`,
      start: t0,
      end: arrival,
      minutes: 3,
    }])
  })

  it("uses exact shared time before dropping sub-half-minute runs for commit thresholds", () => {
    const events: RecorderEvent[] = []
    let lastStop = 0
    for (let index = 0; index < 14; index += 1) {
      const startAt = index === 0 ? 0 : lastStop + PRESENCE_GAP
      const stopAt = startAt + 29_400
      events.push(
        { ...base, session: "A", kind: "prompt", t: t0 + startAt, text: "" },
        { ...base, session: "B", kind: "prompt", t: t0 + startAt, text: "" },
        { ...base, session: "A", kind: "stop", t: t0 + stopAt },
        { ...base, session: "B", kind: "stop", t: t0 + stopAt },
      )
      lastStop = stopAt
    }
    const arrival = t0 + lastStop + 1
    events.push(shaCommit("A", arrival, "shared-micro"))

    const tasks = computeTasks(events, arrival + SETTLE_DELAY).tasks
    expect(tasks.map(task => [task.session, task.source, task.commits.map(item => item.sha), task.entries])).toEqual([
      ["A", "commit", ["shared-micro"], []],
    ])
  })

  it("keeps a foreign hook commit as activity in the attributed window", () => {
    const arrival = t0 + 110 * M
    const tasks = computeTasks([prompt("A", 0), shaCommit("hook-only", arrival, "during-run")], arrival + SETTLE_DELAY).tasks
    expect(tasks.map(task => [task.session, task.source, task.finishedAt, task.entries.map(entry => [entry.start, entry.end, entry.minutes])])).toEqual([
      ["A", "commit", arrival, [[t0, t0 + AI_ALONE_CAP, 15]]],
    ])
  })

  it("ignores unsettled arrivals in tasks and keeps the open cursor at the last settled arrival", () => {
    const firstArrival = t0 + 10 * M
    const lateArrival = t0 + 32 * M
    const events: RecorderEvent[] = [
      prompt("S", 0), stop("S", 10), shaCommit("hook", firstArrival, "settled"),
      prompt("S", 30), shaCommit("hook", lateArrival, "unsettled"),
    ]

    const before = computeTasks(events, t0 + 40 * M)
    expect(before.tasks.map(task => [task.key, task.finishedAt, task.commits.map(item => item.sha), task.entries.map(entry => [entry.start, entry.end, entry.minutes])])).toEqual([
      [`claude-code:S:c:settled`, firstArrival, ["settled"], [[t0, firstArrival, 10]]],
    ])
    expect(before.open).toEqual([{
      session: "S", dir: "repo", agent: "claude-code", since: t0 + 30 * M, minutes: 10,
    }])

    const after = computeTasks(events, lateArrival + SETTLE_DELAY)
    expect(after.tasks.map(task => [task.key, task.finishedAt, task.commits.map(item => item.sha), task.entries.map(entry => [entry.start, entry.end, entry.minutes])])).toEqual([
      [`claude-code:S:c:settled`, firstArrival, ["settled", "unsettled"], [[t0, firstArrival, 10], [t0 + 30 * M, lateArrival, 2]]],
    ])
  })

  it("queues late commits by seenAt without rewinding settled task keys", () => {
    const firstArrival = t0 + 12 * M
    const lateArrival = t0 + 5 * M
    const first = { ...shaCommit("hook", firstArrival, "c3"), seenAt: t0 + 13 * M }
    const lateCommit = { ...shaCommit("hook", lateArrival, "c2"), seenAt: t0 + 40 * M }
    const now = t0 + 40 * M + SETTLE_DELAY
    const tasks = computeTasks([prompt("S", 0), stop("S", 10), first, lateCommit], now).tasks

    expect(tasks.map(task => [task.key, task.finishedAt, task.commits.map(item => item.sha), task.entries.map(entry => [entry.start, entry.end, entry.minutes])])).toEqual([
      [`claude-code:S:c:c3`, firstArrival, ["c3"], [[t0, t0 + 10 * M, 10]]],
    ])
  })

  it("splits commits exactly BURST_GAP apart according to the strict documented boundary", () => {
    const firstArrival = t0 + 10 * M
    const secondArrival = firstArrival + BURST_GAP
    const events: RecorderEvent[] = [
      prompt("S", 0),
      { ...shaCommit("hook", firstArrival, "c1", 1, 0, "fix: first"), body: "Closes T-1" },
      { ...shaCommit("hook", secondArrival, "c2", 1, 0, "fix: second"), body: "Closes T-2" },
    ]
    const tasks = computeTasks(events, secondArrival + SETTLE_DELAY).tasks

    expect(tasks.map(task => [task.key, task.taskSeq, task.finishedAt, task.entries.map(entry => [entry.start, entry.end, entry.minutes])])).toEqual([
      [`claude-code:S:c:c1`, 1, firstArrival, [[t0, firstArrival, 10]]],
      [`claude-code:S:c:c2`, 2, secondArrival, [[firstArrival, secondArrival, 2]]],
    ])
  })

  it("deduplicates identical commits across repository paths", () => {
    const arrival = t0 + 10 * M
    const original = commit("S", 10, "same-sha", 4)
    const otherRepo = { ...commit("hook", 10, "same-sha", 40), repo: "/other/repo/.git" }
    const tasks = computeTasks([prompt("S", 0), stop("S", 10), original, otherRepo], arrival + SETTLE_DELAY).tasks

    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.commits.map(item => item.sha)).toEqual(["same-sha"])
    expect(tasks[0]?.entries).toEqual([{
      key: `claude-code:S:c:same-sha#${t0}#c:same-sha`,
      start: t0,
      end: arrival,
      minutes: 10,
    }])
  })

  it("uses retained entry bounds and the supplied clock for fallback task titles", () => {
    const events = [prompt("S", 0), stop("S", 0.4), prompt("S", 15.4), stop("S", 25.4), end("S", 25.4)]
    const tasks = computeTasks(events, t0 + 25.4 * M + SETTLE_DELAY, {
      clock: ms => `${(ms - t0) / M}`,
    }).tasks

    expect(tasks[0]?.entries.map(entry => [entry.start, entry.end, entry.minutes])).toEqual([
      [t0 + 15.4 * M, t0 + 25.4 * M, 10],
    ])
    expect(tasks[0]?.title).toBe("Coding 15.4–25.4")
  })

  it("is unchanged by reordered duplicate input", () => {
    const events: RecorderEvent[] = [prompt("S", 0), stop("S", 10), end("S", 10), commit("S", 10, "same")]
    const original = computeTasks(events, late(30))
    const reordered = computeTasks([...events, events[0]!, events[3]!].reverse(), late(30))
    expect(reordered).toEqual(original)
  })
})
