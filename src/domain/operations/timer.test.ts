import { describe, expect, it } from "vitest"
import type { OpContext } from "./context"
import { closeTimer, logTimeEntry, startTimerOn, timerStopsWith } from "./timer"
import type { ActiveTimer, Task } from "../types"

const NOW = 1_800_000_000_000
const TODAY = "2027-01-15"
const ctx: OpContext = { now: NOW, today: TODAY, newId: (prefix) => `${prefix}-fixed` }
const timer: ActiveTimer = { taskId: "t-old", projectId: "p-old", label: "Old", startedAt: NOW - 90_000 }
const task: Task = {
  id: "t-new",
  seq: 102,
  title: "New",
  projectId: "p-new",
  status: "todo",
  priority: 1,
  estimateMin: 30,
  plannedFor: null,
  startAt: null,
  dueOn: null,
  notes: "",
  subtasks: [],
  createdAt: 0,
  completedAt: null,
}

describe("timer operations", () => {
  it("closeTimer logs a rounded minute with the original task and project", () => {
    expect(closeTimer(timer, NOW, ctx.newId)).toEqual({
      id: "E-fixed",
      taskId: "t-old",
      projectId: "p-old",
      start: NOW - 90_000,
      end: NOW,
    })
  })

  it("closeTimer ignores sessions that round below one minute and a missing timer", () => {
    expect(closeTimer({ ...timer, startedAt: NOW - 29_000 }, NOW, ctx.newId)).toBeNull()
    expect(closeTimer({ ...timer, startedAt: NOW - 30_000 }, NOW, ctx.newId)).toEqual({
      id: "E-fixed",
      taskId: "t-old",
      projectId: "p-old",
      start: NOW - 30_000,
      end: NOW,
    })
    expect(closeTimer(null, NOW, ctx.newId)).toBeNull()
  })

  it("timerStopsWith only stops the matching task on done or dropped", () => {
    expect(timerStopsWith(timer, "t-old", "done")).toBe(true)
    expect(timerStopsWith(timer, "t-old", "dropped")).toBe(true)
    expect(timerStopsWith(timer, "t-old", "doing")).toBe(false)
    expect(timerStopsWith(timer, "t-new", "done")).toBe(false)
    expect(timerStopsWith(null, "t-old", "done")).toBe(false)
  })

  it("startTimerOn closes the old session, starts the new one and plans an open task for today", () => {
    expect(startTimerOn(timer, task, ctx)).toEqual({
      timer: { taskId: "t-new", projectId: "p-new", label: "New", startedAt: NOW },
      closedEntry: { id: "E-fixed", taskId: "t-old", projectId: "p-old", start: NOW - 90_000, end: NOW },
      task: { ...task, status: "doing", plannedFor: TODAY },
    })
  })

  it("startTimerOn leaves done status unchanged", () => {
    expect(startTimerOn(null, { ...task, status: "done" }, ctx).task.status).toBe("done")
  })

  it("logTimeEntry creates a linked entry ending at the supplied time", () => {
    expect(logTimeEntry(task, 25, ctx)).toEqual({
      id: "E-fixed",
      taskId: "t-new",
      projectId: "p-new",
      start: NOW - 25 * 60_000,
      end: NOW,
    })
  })

  it("logTimeEntry returns null for non-positive minutes", () => {
    expect(logTimeEntry(task, 0, ctx)).toBeNull()
    expect(logTimeEntry(task, -5, ctx)).toBeNull()
  })
})
