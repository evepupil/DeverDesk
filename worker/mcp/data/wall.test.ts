import { beforeAll, describe, expect, it } from "vitest"
import { dayKeyOf } from "../../../src/domain/calendar"
import { minutesOf } from "../../../src/domain/tasks"
import type { Task, TimeEntry, WorkbenchData } from "../../../src/domain/types"
import { createClock } from "../clock"
import { DEFAULT_PROFILE, toWallWorkbench } from "./wall"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    seq: 1,
    title: "Test task",
    projectId: null,
    status: "todo",
    priority: 1,
    estimateMin: 30,
    plannedFor: "2026-10-01",
    startAt: "09:00",
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: Date.parse("2026-09-30T23:00:00Z"),
    completedAt: null,
    ...overrides,
  }
}

function entry(start: string, end: string): TimeEntry {
  return {
    id: "entry-1",
    taskId: "task-1",
    projectId: null,
    start: Date.parse(start),
    end: Date.parse(end),
  }
}

describe("toWallWorkbench", () => {
  it("moves Shanghai timestamps into a UTC-readable local date without mutating inputs", () => {
    const originalEntry = entry("2026-09-30T23:30:00Z", "2026-10-01T00:30:00Z")
    const originalTask = task({
      completedAt: Date.parse("2026-09-30T23:45:00Z"),
    })
    const original = { entries: [originalEntry], tasks: [originalTask] }
    const before = structuredClone(original)
    const clock = createClock("Asia/Shanghai", Date.parse("2026-10-01T00:00:00Z"))

    const result = toWallWorkbench(original, clock)
    expect(dayKeyOf(new Date(result.entries[0].start))).toBe("2026-10-01")
    expect(result.entries[0].start).toBe(Date.parse("2026-10-01T07:30:00Z"))
    expect(result.entries[0].end).toBe(Date.parse("2026-10-01T08:30:00Z"))
    expect(result.tasks[0].createdAt).toBe(Date.parse("2026-10-01T07:00:00Z"))
    expect(result.tasks[0].completedAt).toBe(Date.parse("2026-10-01T07:45:00Z"))
    expect(result.tasks[0].plannedFor).toBe("2026-10-01")
    expect(original).toEqual(before)
    expect(result.tasks[0]).not.toBe(originalTask)
    expect(result.entries[0]).not.toBe(originalEntry)
  })

  it("keeps a New York entry's real duration across the spring DST jump", () => {
    const input = entry("2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z")
    const clock = createClock("America/New_York", Date.parse("2026-03-08T12:00:00Z"))
    const result = toWallWorkbench({ entries: [input] }, clock)
    expect(result.entries[0].start).toBe(Date.parse("2026-03-08T01:30:00Z"))
    expect(result.entries[0].end).toBe(Date.parse("2026-03-08T02:30:00Z"))
    expect(minutesOf(result.entries[0])).toBe(60)
    expect(input.start).toBe(Date.parse("2026-03-08T06:30:00Z"))
  })

  it("fills absent collections with fresh empty arrays and default schedule settings", () => {
    const result: WorkbenchData = toWallWorkbench({}, createClock(undefined, 0))
    expect(result.profile).toEqual(DEFAULT_PROFILE)
    expect(result.profile).not.toBe(DEFAULT_PROFILE)
    expect(result.projects).toEqual([])
    expect(result.tasks).toEqual([])
    expect(result.entries).toEqual([])
    expect(result.ledger).toEqual([])
    expect(result.routines).toEqual([])
    expect(result.notes).toEqual([])
    expect(result.timer).toBeNull()
  })

  it("converts ledger and timer timestamps independently", () => {
    const clock = createClock("Asia/Shanghai", Date.parse("2026-10-01T00:00:00Z"))
    const result = toWallWorkbench({
      ledger: [{
        id: "ledger-1",
        kind: "income",
        amount: 10,
        projectId: null,
        category: "other-income",
        channel: "bank",
        status: "received",
        date: "2026-10-01",
        expectedOn: null,
        note: "",
        createdAt: Date.parse("2026-09-30T23:30:00Z"),
      }],
      timer: {
        taskId: null,
        projectId: null,
        label: "Focus",
        startedAt: Date.parse("2026-09-30T23:45:00Z"),
      },
    }, clock)
    expect(result.ledger[0].createdAt).toBe(Date.parse("2026-10-01T07:30:00Z"))
    expect(result.ledger[0].date).toBe("2026-10-01")
    expect(result.timer?.startedAt).toBe(Date.parse("2026-10-01T07:45:00Z"))
  })
})
