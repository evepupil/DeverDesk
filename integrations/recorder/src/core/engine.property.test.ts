import { describe, expect, it } from "vitest"
import { SETTLE_DELAY } from "./constants"
import { computeTasks } from "./engine"
import { dedupeAndSort } from "./dedupe"
import { buildPresenceIntervals, groupWindows } from "./presence"
import { splitAndShare } from "./share"
import type { CommitEvent, RecorderEvent } from "./types"

const M = 60_000
const baseTime = Date.UTC(2025, 2, 1)
const base = { v: 1 as const, agent: "claude-code" as const, dir: "repo", cwd: "/repo" }

function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function generatedStreams(seed: number): RecorderEvent[][] {
  const random = rng(seed)
  const streams: RecorderEvent[][] = []
  for (let trial = 0; trial < 300; trial += 1) {
    const events: RecorderEvent[] = []
    const count = 2 + Math.floor(random() * 3)
    for (let w = 0; w < count; w += 1) {
      const session = `s${w}`
      const event = (kind: "prompt" | "stop" | "end", minute: number, text = "") => ({
        ...base, session, kind, t: baseTime + minute * M, text,
      })
      events.push(
        { ...base, session, kind: "start", t: baseTime },
        event("prompt", 0, "initial work"),
        event("stop", 10),
        { ...base, session, kind: "done", t: baseTime + 10 * M, title: "first done" },
        event("prompt", 20, "second task"),
        event("stop", 30),
        event("end", 30),
      )

      let minute = 80 + Math.floor(random() * 15)
      const countRandom = 8 + Math.floor(random() * 10)
      for (let i = 0; i < countRandom; i += 1) {
        minute += 1 + Math.floor(random() * 35)
        const choice = Math.floor(random() * 5)
        if (choice === 0) events.push(event("prompt", minute, `prompt ${trial}-${i}`))
        else if (choice === 1) events.push(event("stop", minute))
        else if (choice === 2) events.push(event("end", minute))
        else if (choice === 3) events.push({
          ...base, session: `hook-${w}`, kind: "commit", t: baseTime + minute * M,
          repo: "/repo/.git", sha: `sha-${trial}-${w}-${i}`, subject: "fix: generated",
          additions: 1 + Math.floor(random() * 20), deletions: Math.floor(random() * 10), files: 1,
          authoredAt: baseTime + minute * M,
        } satisfies CommitEvent)
        else events.push({ ...base, session, kind: "done", t: baseTime + minute * M, title: `done ${trial}-${i}` })
      }
    }
    streams.push(events)
  }
  return streams
}

function assertTasksOnlyGrow(before: ReturnType<typeof computeTasks>["tasks"], after: ReturnType<typeof computeTasks>["tasks"]): void {
  for (const oldTask of before) {
    const newTask = after.find(task => task.key === oldTask.key)
    expect(newTask, `missing task ${oldTask.key}`).toBeDefined()
    expect(newTask && {
      agent: newTask.agent,
      session: newTask.session,
      dir: newTask.dir,
      source: newTask.source,
      title: newTask.title,
      finishedAt: newTask.finishedAt,
      taskSeq: newTask.taskSeq,
    }).toEqual({
      agent: oldTask.agent,
      session: oldTask.session,
      dir: oldTask.dir,
      source: oldTask.source,
      title: oldTask.title,
      finishedAt: oldTask.finishedAt,
      taskSeq: oldTask.taskSeq,
    })
    expect(newTask?.commits.slice(0, oldTask.commits.length)).toEqual(oldTask.commits)
    expect(newTask?.entries.slice(0, oldTask.entries.length)).toEqual(oldTask.entries)
  }
}

describe("engine properties", () => {
  it("preserves every settled task prefix across 300 seeded random streams", () => {
    const streams = generatedStreams(0x5eed1234)
    const t1 = baseTime + 60 * M
    for (const events of streams) {
      const early = computeTasks(events.filter(event => event.t < t1), t1).tasks
      const end = Math.max(...events.map(event => event.t))
      const later = computeTasks(events, end + SETTLE_DELAY + 3 * 60 * M).tasks
      assertTasksOnlyGrow(early, later)
    }
  })

  it("is invariant under seeded input permutations and duplicate log rows", () => {
    const streams = generatedStreams(0xc0ffee).slice(0, 100)
    const random = rng(0x1badb002)
    for (const events of streams) {
      const shuffled = [...events]
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1))
        const current = shuffled[index]
        const other = shuffled[swap]
        if (current && other) {
          shuffled[index] = other
          shuffled[swap] = current
        }
      }
      shuffled.push(...events.slice(0, Math.min(5, events.length)))
      const now = Math.max(...events.map(event => event.t)) + SETTLE_DELAY + 3 * M
      expect(computeTasks(shuffled, now)).toEqual(computeTasks(events, now))
    }
  })

  it("conserves shared exact time and never emits fractional entry minutes", () => {
    const streams = generatedStreams(0xdecafbad).slice(0, 30)
    for (const events of streams) {
      const ordered = dedupeAndSort(events)
      const intervals = buildPresenceIntervals(groupWindows(ordered), baseTime + 2_000 * M)
      const shared = splitAndShare(intervals)
      const endpoints = [...intervals.values()].flatMap(items => items.flatMap(item => [item.start, item.end]))
        .sort((a, b) => a - b)
      let unionMs = 0
      for (let index = 1; index < endpoints.length; index += 1) {
        const left = endpoints[index - 1]
        const right = endpoints[index]
        if (left === undefined || right === undefined || right <= left) continue
        const middle = (left + right) / 2
        const active = [...intervals.values()].filter(items => items.some(item => item.start <= middle && middle < item.end)).length
        if (active > 0) unionMs += right - left
        const density = [...shared.values()].flatMap(runs => runs.flatMap(run => run.fragments))
          .filter(fragment => fragment.start <= middle && middle < fragment.end)
          .reduce((sum, fragment) => sum + fragment.exactMinutes * M / (fragment.end - fragment.start), 0)
        expect(density).toBeLessThanOrEqual(1 + 1e-10)
        if (active > 0) expect(density).toBeCloseTo(1, 10)
      }
      const allocatedMinutes = [...shared.values()].flatMap(runs => runs).reduce((sum, run) => sum + run.exactMinutes, 0)
      expect(allocatedMinutes).toBeCloseTo(unionMs / M, 8)

      const result = computeTasks(events, baseTime + 2_000 * M)
      for (const task of result.tasks) {
        expect(task.entries.every(entry => entry.minutes >= 1 && Number.isInteger(entry.minutes))).toBe(true)
      }
    }
  })
})
