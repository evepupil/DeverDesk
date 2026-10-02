import { beforeAll, describe, expect, it } from "vitest"
import type { Task, TimeEntry } from "./types"
import { estimateAccuracy } from "./insights"

beforeAll(() => {
  process.env.TZ = "UTC"
})

const period = { start: "2027-01-15", end: "2027-01-15" }
const completedAt = Date.UTC(2027, 0, 15, 12)

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    seq: 1,
    title: "Regular task",
    projectId: null,
    status: "done",
    priority: 0,
    estimateMin: 30,
    plannedFor: null,
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: completedAt - 60_000,
    completedAt,
    ...overrides,
  }
}

function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: "entry-1",
    taskId: "task-1",
    projectId: null,
    start: completedAt - 60_000,
    end: completedAt,
    minutes: 45,
    ...overrides,
  }
}

describe("estimateAccuracy", () => {
  it("does not include coding-origin tasks in estimates or actual time", () => {
    const regularTask = makeTask()
    const regularEntry = makeEntry()
    const baseline = estimateAccuracy([regularTask], [regularEntry], period)
    const codingTask = makeTask({ id: "coding-task", origin: "coding", estimateMin: 60 })
    const codingEntry = makeEntry({ id: "coding-entry", taskId: codingTask.id, origin: "coding", minutes: 90 })

    expect(baseline).toEqual({ estimate: 30, actual: 45, ratio: 1.5 })
    expect(estimateAccuracy([regularTask, codingTask], [regularEntry, codingEntry], period)).toEqual(baseline)
  })
})
