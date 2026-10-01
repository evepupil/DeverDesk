import { describe, expect, it } from "vitest"
import type { OpContext } from "./context"
import { addSubtask, moveToDay, newTask, patchTask, planOn, removeSubtask, scheduleAt, toggleSubtask, withStatus } from "./tasks"
import type { Task } from "../types"

const NOW = 1_800_000_000_000
const TODAY = "2027-01-15"
const ctx: OpContext = { now: NOW, today: TODAY, newId: (prefix) => `${prefix}-fixed` }

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    seq: 101,
    title: "Task",
    projectId: null,
    status: "todo",
    priority: 2,
    estimateMin: 45,
    plannedFor: null,
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: 100,
    completedAt: null,
    ...overrides,
  }
}

describe("task operations", () => {
  it("newTask trims its title, assigns defaults and uses the supplied sequence and context", () => {
    expect(newTask({ title: "  Write tests  ", startAt: "09:30" }, 108, ctx)).toEqual({
      id: "t-fixed",
      seq: 108,
      title: "Write tests",
      projectId: null,
      status: "todo",
      priority: 0,
      estimateMin: 30,
      plannedFor: null,
      startAt: null,
      dueOn: null,
      notes: "",
      subtasks: [],
      createdAt: NOW,
      completedAt: null,
    })
  })

  it("newTask timestamps a new done task and keeps startAt only with a planned day", () => {
    const task = newTask({ title: " Done ", status: "done", plannedFor: TODAY, startAt: "10:15" }, 109, ctx)
    expect(task).toMatchObject({ title: "Done", status: "done", plannedFor: TODAY, startAt: "10:15", completedAt: NOW })
  })

  it("patchTask trims title, clears a moved start time and timestamps a status edit", () => {
    const before = makeTask({ title: "Old", plannedFor: TODAY, startAt: "09:00" })
    const next = patchTask(before, { title: "  New  ", plannedFor: "2027-01-16", status: "done" }, ctx)
    expect(next).toMatchObject({ title: "New", plannedFor: "2027-01-16", startAt: null, status: "done", completedAt: NOW })
    expect(before.title).toBe("Old")
    expect(before.startAt).toBe("09:00")
  })

  it("patchTask clears startAt even if a time is supplied while unplanned", () => {
    expect(patchTask(makeTask({ plannedFor: TODAY }), { plannedFor: null, startAt: "11:00" }, ctx).startAt).toBeNull()
  })

  it("withStatus schedules a newly completed unplanned task for today", () => {
    const next = withStatus(makeTask(), "done", ctx)
    expect(next).toMatchObject({ status: "done", completedAt: NOW, plannedFor: TODAY })
  })

  it("withStatus clears completion time when dropped and keeps an existing plan", () => {
    const next = withStatus(makeTask({ plannedFor: "2027-01-12", completedAt: 10 }), "dropped", ctx)
    expect(next).toMatchObject({ status: "dropped", completedAt: null, plannedFor: "2027-01-12" })
  })

  it("planOn converts a planned backlog task to todo and clears its old start time", () => {
    expect(planOn(makeTask({ status: "backlog", plannedFor: TODAY, startAt: "08:30" }), "2027-01-16"))
      .toMatchObject({ status: "todo", plannedFor: "2027-01-16", startAt: null })
  })

  it("planOn keeps startAt for the same day", () => {
    expect(planOn(makeTask({ plannedFor: TODAY, startAt: "08:30" }), TODAY).startAt).toBe("08:30")
  })

  it("scheduleAt supplies today when the task has no planned day", () => {
    expect(scheduleAt(makeTask(), "13:20", ctx)).toMatchObject({ plannedFor: TODAY, startAt: "13:20" })
  })

  it("moveToDay resets the timeline position", () => {
    expect(moveToDay(makeTask({ plannedFor: TODAY, startAt: "13:20" }), "2027-01-16"))
      .toMatchObject({ plannedFor: "2027-01-16", startAt: null })
  })

  it("subtask operations trim, toggle and remove only the requested record", () => {
    const added = addSubtask(makeTask(), "  Review  ", ctx)
    expect(added.subtasks).toEqual([{ id: "s-fixed", title: "Review", done: false }])
    const toggled = toggleSubtask({ ...added, subtasks: [...added.subtasks, { id: "s-other", title: "Other", done: true }] }, "s-fixed")
    expect(toggled.subtasks).toEqual([
      { id: "s-fixed", title: "Review", done: true },
      { id: "s-other", title: "Other", done: true },
    ])
    expect(removeSubtask(toggled, "s-fixed").subtasks).toEqual([{ id: "s-other", title: "Other", done: true }])
  })
})
