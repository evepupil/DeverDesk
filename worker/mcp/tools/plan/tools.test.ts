import { describe, expect, it } from "vitest"
import { withStatus, closeTimer, timerStopsWith } from "../../../../src/domain/operations"
import { SINGLETON_ID } from "../../../../src/sync/protocol"
import type { Task } from "../../../../src/domain/types"
import { updateTasksTool } from "./update-tasks"
import { planDayTool } from "./plan-day"
import { planWeekTool } from "./plan-week"
import { rescheduleTool } from "./reschedule"
import { manageProjectTool } from "./manage-project"
import { manageRoutineTool } from "./manage-routine"
import { deleteRecordsTool } from "./delete-records"
import { MAX_CHANGES_PER_CALL } from "../../types"
import {
  FIXED_NOW,
  FIXED_TODAY,
  makeData,
  makeEntry,
  makeLedger,
  makeProject,
  makeRoutine,
  makeTask,
  makeTimer,
  toolContext,
} from "./test-utils"

describe("plan tools", () => {
  it("update_tasks follows status and timer operations, including the one-minute threshold", async () => {
    const task = makeTask({ id: "task-1", seq: 101, status: "doing" })
    const timer = makeTimer({ taskId: task.id, startedAt: FIXED_NOW - 3 * 60_000 })
    const ctx = toolContext(makeData({ tasks: [task], timer }), {
      versions: {
        "task:task-1": { updatedAt: 10, rev: 41 },
        [`timer:${SINGLETON_ID}`]: { updatedAt: 11, rev: 42 },
      },
    })
    const plan = await updateTasksTool.plan(ctx, { updates: [{ task: "T-101", status: "done" }], reason: "Finished" })
    const expected = withStatus(task, "done", { now: ctx.clock.now, today: ctx.clock.today, newId: ctx.newId })
    const expectedEntry = closeTimer(timer, ctx.clock.now, (prefix) => `${prefix}-generated-1`)
    expect(timerStopsWith(timer, task.id, "done")).toBe(true)
    expect(plan.changes).toHaveLength(3)
    expect(plan.changes[0]).toMatchObject({ kind: "task", action: "update", beforeRev: 41, after: expected })
    expect(plan.changes[1]).toMatchObject({ kind: "timer", action: "delete", beforeRev: 42, after: null })
    expect(plan.changes[2]).toMatchObject({ kind: "entry", action: "create", beforeRev: null, after: { ...expectedEntry, origin: "ai" } })
    expect(plan.output).toMatchObject({ updated: [{ id: task.id, status: "done", plannedFor: FIXED_TODAY }], stoppedTimer: true })
    expect(plan.reason).toBe("Finished")

    const shortCtx = toolContext(makeData({ tasks: [task], timer: makeTimer({ taskId: task.id, startedAt: FIXED_NOW - 20_000 }) }))
    const shortPlan = await updateTasksTool.plan(shortCtx, { updates: [{ task: task.id, status: "dropped" }] })
    expect(shortPlan.changes.map(({ kind }) => kind)).toEqual(["task", "timer"])
    expect(shortPlan.output).toMatchObject({ stoppedTimer: true, loggedEntries: [] })
    const continuing = await updateTasksTool.plan(toolContext(makeData({ tasks: [task], timer })), {
      updates: [{ task: task.id, status: "todo" }],
    })
    expect(continuing.changes.map(({ kind }) => kind)).toEqual(["task"])
    expect(continuing.output).toMatchObject({ stoppedTimer: false, loggedEntries: [] })
  })

  it("update_tasks leaves completion metadata and timers alone when status is unchanged", async () => {
    const task = makeTask({ id: "completed-task", status: "done", completedAt: FIXED_NOW - 86_400_000, plannedFor: null })
    const timer = makeTimer({ taskId: task.id })
    const plan = await updateTasksTool.plan(toolContext(makeData({ tasks: [task], timer })), {
      updates: [{ task: task.id, title: "Renamed", status: "done" }],
    })
    const after = plan.changes[0].after as Task
    expect(plan.changes).toHaveLength(1)
    expect(after).toMatchObject({ title: "Renamed", status: "done", completedAt: task.completedAt, plannedFor: null })
    expect(plan.output).toMatchObject({ stoppedTimer: false, loggedEntries: [] })
  })

  it("update_tasks resolves all subtask positions before removing them", async () => {
    const task = makeTask({
      id: "remove-many",
      subtasks: [
        { id: "sub-1", title: "First", done: false },
        { id: "sub-2", title: "Second", done: false },
        { id: "sub-3", title: "Third", done: false },
      ],
    })
    const plan = await updateTasksTool.plan(toolContext(makeData({ tasks: [task] })), {
      updates: [{ task: task.id, removeSubtasks: ["2", "3"] }],
    })
    expect((plan.changes[0].after as Task).subtasks).toEqual([{ id: "sub-1", title: "First", done: false }])
  })

  it("update_tasks allows attached timer changes beyond the 20 input updates", async () => {
    const tasks = Array.from({ length: 20 }, (_, index) => makeTask({ id: `bulk-${index}`, seq: 501 + index }))
    const timer = makeTimer({ taskId: tasks[0].id, startedAt: FIXED_NOW - 5 * 60_000 })
    const plan = await updateTasksTool.plan(toolContext(makeData({ tasks, timer })), {
      updates: tasks.map(({ id }) => ({ task: id, status: "done" })),
    })
    expect(plan.changes).toHaveLength(22)
    expect(MAX_CHANGES_PER_CALL).toBe(25)
    expect(plan.changes.filter(({ kind }) => kind === "task")).toHaveLength(20)
    expect(plan.changes.map(({ kind }) => kind)).toContain("timer")
    expect(plan.changes.map(({ kind }) => kind)).toContain("entry")
  })

  it("update_tasks appends notes and resolves subtasks by number while preserving the task revision", async () => {
    const task = makeTask({ id: "task-2", subtasks: [{ id: "s-1", title: "Draft", done: false }] })
    const ctx = toolContext(makeData({ tasks: [task] }), { versions: { "task:task-2": { updatedAt: 20, rev: 77 } } })
    const plan = await updateTasksTool.plan(ctx, { updates: [{ task: task.id, appendNotes: "Follow up", completeSubtasks: ["1"], addSubtasks: ["Review"] }] })
    const after = plan.changes[0].after as Task
    expect(plan.changes[0].beforeRev).toBe(77)
    expect(after.notes).toBe("Follow up")
    expect(after.subtasks).toEqual([
      { id: "s-1", title: "Draft", done: true },
      { id: "s-generated-1", title: "Review", done: false },
    ])
    await expect(updateTasksTool.plan(toolContext(makeData({ tasks: [task] })), {
      updates: [{ task: task.id, startAt: "09:00" }],
    })).rejects.toThrow("needs a planned day")
  })

  it("plan_day uses the interface's rounded current-time start and accounts for busy blocks", async () => {
    const task = makeTask({ id: "day-task", seq: 111, estimateMin: 30 })
    const ctx = toolContext(makeData({ tasks: [task] }), { versions: { "task:day-task": { updatedAt: 5, rev: 13 } } })
    const plan = await planDayTool.plan(ctx, {
      tasks: ["T-111"],
      busy: [{ start: "10:45", end: "11:30", label: "Meeting" }],
    })
    expect(ctx.clock.minuteOfDay(FIXED_NOW)).toBe(637)
    expect(plan.changes[0]).toMatchObject({ kind: "task", action: "update", beforeRev: 13, after: { plannedFor: FIXED_TODAY, startAt: "11:30" } })
    expect(plan.output).toMatchObject({
      date: FIXED_TODAY,
      placed: [{ task: { id: "day-task", startAt: "11:30" }, start: "11:30", end: "12:00" }],
      capacity: { capacityMin: 180, plannedMin: 30, remainingMin: 150, overbooked: false },
    })
  })

  it("plan_day dryRun returns placements without planned changes", async () => {
    const task = makeTask({ id: "day-preview", seq: 112, estimateMin: 20 })
    const plan = await planDayTool.plan(toolContext(makeData({ tasks: [task] })), { date: "2026-10-02", tasks: [task.id], dryRun: true })
    expect(plan.changes).toEqual([])
    expect(plan.output).toMatchObject({ date: "2026-10-02", dryRun: true, placed: [{ start: "08:00", end: "08:20" }] })
  })

  it("plan_day prefers unscheduled tasks for the selected day in priority, due-date, and number order", async () => {
    const tasks = [
      makeTask({ id: "day-low", seq: 213, priority: 2, dueOn: "2026-10-01", plannedFor: FIXED_TODAY, estimateMin: 15 }),
      makeTask({ id: "day-priority", seq: 211, priority: 4, dueOn: "2026-10-03", plannedFor: FIXED_TODAY, estimateMin: 15 }),
      makeTask({ id: "day-due-second", seq: 212, priority: 4, dueOn: "2026-10-02", plannedFor: FIXED_TODAY, estimateMin: 15 }),
      makeTask({ id: "day-due-first", seq: 210, priority: 4, dueOn: "2026-10-02", plannedFor: FIXED_TODAY, estimateMin: 15 }),
      makeTask({ id: "day-suggestion", seq: 214, priority: 4, estimateMin: 15 }),
    ]
    const plan = await planDayTool.plan(toolContext(makeData({ tasks })), { date: FIXED_TODAY })
    const placed = plan.output.placed as { task: { id: string } }[]
    expect(placed.map(({ task }) => task.id)).toEqual(["day-due-first", "day-due-second", "day-priority", "day-low"])
  })

  it("plan_day falls back to suggestions without including backlog tasks", async () => {
    const tasks = [
      makeTask({ id: "day-backlog", seq: 215, status: "backlog", priority: 4, estimateMin: 15 }),
      makeTask({ id: "day-todo", seq: 216, status: "todo", estimateMin: 15 }),
      makeTask({ id: "day-slipped", seq: 217, status: "doing", plannedFor: "2026-09-30", estimateMin: 15 }),
      makeTask({ id: "day-done", seq: 218, status: "done", plannedFor: FIXED_TODAY }),
    ]
    const plan = await planDayTool.plan(toolContext(makeData({ tasks })), { date: FIXED_TODAY })
    const placed = plan.output.placed as { task: { id: string } }[]
    expect(placed.map(({ task }) => task.id)).toEqual(["day-todo"])
    expect(placed.some(({ task }) => task.id === "day-backlog")).toBe(false)
  })

  it("plan_day reports ambiguous display codes instead of choosing a task", async () => {
    const tasks = [makeTask({ id: "duplicate-a", seq: 219 }), makeTask({ id: "duplicate-b", seq: 219 })]
    await expect(planDayTool.plan(toolContext(makeData({ tasks })), { tasks: ["T-219"] }))
      .rejects.toThrow("duplicate-a, duplicate-b")
  })

  it("plan_week respects capacity, due dates, and leaves earlier days untouched", async () => {
    const due = makeTask({ id: "week-due", seq: 121, estimateMin: 60, dueOn: "2026-10-02" })
    const undated = makeTask({ id: "week-open", seq: 122, estimateMin: 30 })
    const completed = makeTask({ id: "week-done", seq: 123, estimateMin: 15, plannedFor: "2026-10-02", status: "done" })
    const ctx = toolContext(makeData({ profile: { name: "Test", weekdayMin: 60, weekendMin: 30, dayStartHour: 8, dayEndHour: 18, timeZone: "Asia/Shanghai" }, tasks: [due, undated, completed] }), {
      versions: { "task:week-due": { updatedAt: 21, rev: 51 }, "task:week-open": { updatedAt: 22, rev: 52 } },
    })
    const plan = await planWeekTool.plan(ctx, { weekOf: FIXED_TODAY, tasks: ["T-121", "T-122"] })
    expect(plan.changes.map((change) => change.beforeRev)).toEqual([51, 52])
    expect(plan.changes.map((change) => (change.after as Task).plannedFor)).toEqual([FIXED_TODAY, "2026-10-02"])
    expect(plan.output).toMatchObject({
      weekStart: "2026-09-28",
      placed: [{ task: { id: "week-due", plannedFor: FIXED_TODAY }, day: FIXED_TODAY, overbooked: false }, { task: { id: "week-open", plannedFor: "2026-10-02" }, day: "2026-10-02", overbooked: false }],
    })
    const days = (plan.output.days as { date: string; remainingMin: number }[])
    expect(days.map(({ date }) => date)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"])
    expect(days.slice(0, 3).map(({ remainingMin }) => remainingMin)).toEqual([60, 60, 60])
    expect(days.slice(3, 5).map(({ remainingMin }) => remainingMin)).toEqual([0, 15])
  })

  it("plan_week sorts default candidates before selecting 20 and reports the skipped count", async () => {
    const candidates = [
      makeTask({ id: "week-seq-203", seq: 203, dueOn: "2026-10-02", priority: 3, estimateMin: 15 }),
      makeTask({ id: "week-seq-205", seq: 205, dueOn: "2026-10-02", priority: 4, estimateMin: 15 }),
      makeTask({ id: "week-seq-204", seq: 204, dueOn: "2026-10-02", priority: 4, estimateMin: 15 }),
      makeTask({ id: "week-seq-202", seq: 202, dueOn: "2026-10-02", priority: 0, estimateMin: 15 }),
      ...Array.from({ length: 18 }, (_, index) => makeTask({
        id: `week-seq-${206 + index}`,
        seq: 206 + index,
        dueOn: "2026-10-03",
        priority: 2,
        estimateMin: 15,
      })),
    ]
    const plan = await planWeekTool.plan(toolContext(makeData({ tasks: candidates })), { weekOf: FIXED_TODAY })
    const placed = plan.output.placed as { task: { id: string } }[]
    expect(placed).toHaveLength(20)
    expect(placed.slice(0, 4).map(({ task }) => task.id)).toEqual([
      "week-seq-204", "week-seq-205", "week-seq-203", "week-seq-202",
    ])
    expect(plan.output.skipped).toBe(2)
  })

  it("reschedule moves selected overdue work and clears its timeline unless keepTime is requested", async () => {

    const slipped = makeTask({ id: "slipped", seq: 131, plannedFor: "2026-09-30", startAt: "09:45" })
    const overdue = makeTask({ id: "due-overdue", seq: 132, dueOn: "2026-09-30" })
    const done = makeTask({ id: "already-done", seq: 133, status: "done", dueOn: "2026-09-20" })
    const ctx = toolContext(makeData({ tasks: [slipped, overdue, done] }), {
      versions: { "task:slipped": { updatedAt: 1, rev: 7 }, "task:due-overdue": { updatedAt: 2, rev: 8 } },
    })
    const plan = await rescheduleTool.plan(ctx, { selector: { overdue: true }, to: "2026-10-04" })
    expect(plan.changes).toHaveLength(2)
    expect(plan.changes.map(({ beforeRev }) => beforeRev)).toEqual([7, 8])
    expect(plan.output).toMatchObject({
      moved: [
        { task: { id: "slipped", plannedFor: "2026-10-04", startAt: null }, from: "2026-09-30", to: "2026-10-04" },
        { task: { id: "due-overdue", plannedFor: "2026-10-04" }, from: null, to: "2026-10-04" },
      ],
      skipped: [],
      keepTime: false,
    })
    const kept = await rescheduleTool.plan(toolContext(makeData({ tasks: [slipped] })), {
      tasks: [slipped.id], shiftDays: 1, keepTime: true,
    })
    expect(kept.output).toMatchObject({ moved: [{ task: { id: slipped.id, plannedFor: "2026-10-01", startAt: "09:45" } }], keepTime: true })
  })

  it("manage_project creates with interface defaults and manages milestones idempotently", async () => {
    const ctx = toolContext(makeData({ projects: [makeProject()] }), { versions: { "project:p-1": { updatedAt: 30, rev: 63 } } })
    const created = await manageProjectTool.plan(ctx, { action: "create", name: "New project" })
    expect(created.changes[0]).toMatchObject({ kind: "project", action: "create", beforeRev: null, after: { name: "New project", color: "blue", stage: "idea", monthlyTarget: null } })
    const updatedProject = await manageProjectTool.plan(ctx, { action: "update", project: "Project", stage: "paused", monthlyTarget: 400 })
    expect(updatedProject.changes[0]).toMatchObject({ kind: "project", action: "update", beforeRev: 63, after: { stage: "paused", monthlyTarget: 400 } })
    const added = await manageProjectTool.plan(ctx, { action: "add_milestone", project: "p-1", title: "Release", due: "2026-11-01" })
    expect(added.changes[0]).toMatchObject({ kind: "project", action: "update", beforeRev: 63 })
    expect(added.output).toMatchObject({ milestone: { title: "Release", due: "2026-11-01", doneOn: null } })

    await expect(manageProjectTool.plan(ctx, {
      action: "add_milestone", project: "p-1", title: "M".repeat(41), due: "2026-11-01",
    })).rejects.toThrow("at most 40 characters")
    const maxTitle = "M".repeat(40)
    const addedAtLimit = await manageProjectTool.plan(ctx, {
      action: "add_milestone", project: "p-1", title: maxTitle, due: "2026-11-01",
    })
    expect(addedAtLimit.output).toMatchObject({ milestone: { title: maxTitle } })
    expect(manageProjectTool.inputSchema.properties?.title).toMatchObject({ maxLength: 40 })

    const projectWithMilestone = makeProject({ milestones: [{ id: "m-1", title: "Release", due: "2026-11-01", doneOn: null }] })
    const completeCtx = toolContext(makeData({ projects: [projectWithMilestone] }))
    const completed = await manageProjectTool.plan(completeCtx, { action: "complete_milestone", project: "p-1", milestone: "Release" })
    expect(completed.changes[0].after).toMatchObject({ milestones: [{ id: "m-1", doneOn: FIXED_TODAY }] })
    const reopenCtx = toolContext(makeData({ projects: [{ ...projectWithMilestone, milestones: [{ ...projectWithMilestone.milestones[0], doneOn: "2026-09-01" }] }] }))
    const reopened = await manageProjectTool.plan(reopenCtx, { action: "reopen_milestone", project: "p-1", milestone: "m-1" })
    expect(reopened.changes[0].after).toMatchObject({ milestones: [{ id: "m-1", doneOn: null }] })
    await expect(manageProjectTool.plan(reopenCtx, {
      action: "update_milestone", project: "p-1", milestone: "m-1", title: "M".repeat(41),
    })).rejects.toThrow("at most 40 characters")
    const updatedMilestone = await manageProjectTool.plan(reopenCtx, {
      action: "update_milestone", project: "p-1", milestone: "m-1", title: "M".repeat(40), due: "2026-11-15",
    })
    expect(updatedMilestone.changes[0].after).toMatchObject({ milestones: [{ id: "m-1", title: "M".repeat(40), due: "2026-11-15" }] })
    const removedMilestone = await manageProjectTool.plan(reopenCtx, { action: "remove_milestone", project: "p-1", milestone: "Release" })
    expect(removedMilestone.changes[0].after).toMatchObject({ milestones: [] })
  })

  it("manage_routine creates with form defaults and archives without losing completion history", async () => {
    const routine = makeRoutine({ doneOn: ["2026-09-30"] })
    const ctx = toolContext(makeData({ routines: [routine] }), { versions: { "routine:r-1": { updatedAt: 12, rev: 29 } } })
    const created = await manageRoutineTool.plan(ctx, { action: "create", title: "Exercise" })
    expect(created.changes[0]).toMatchObject({ kind: "routine", action: "create", after: { title: "Exercise", cadence: "daily", estimateMin: 30, projectId: null } })
    const updated = await manageRoutineTool.plan(ctx, { action: "update", routine: "r-1", title: "Daily movement", cadence: "weekdays", estimateMin: 20 })
    expect(updated.changes[0]).toMatchObject({ kind: "routine", action: "update", beforeRev: 29, after: { title: "Daily movement", cadence: "weekdays", estimateMin: 20 } })
    const archived = await manageRoutineTool.plan(ctx, { action: "archive", routine: "Routine" })
    expect(archived.changes[0]).toMatchObject({ action: "update", beforeRev: 29, after: { archived: true, doneOn: ["2026-09-30"] } })
    const restored = await manageRoutineTool.plan(toolContext(makeData({ routines: [{ ...routine, archived: true }] })), { action: "unarchive", routine: routine.id })
    expect(restored.output).toMatchObject({ routine: { id: "r-1", archived: false }, changed: true })
  })

  it("delete_records plans all supported deletes and clears the timer attached to a deleted task", async () => {
    const task = makeTask({ id: "delete-task", seq: 141 })
    const entry = makeEntry({ id: "delete-entry", taskId: task.id })
    const ledger = makeLedger({ id: "delete-ledger" })
    const ctx = toolContext(makeData({ tasks: [task], entries: [entry], ledger: [ledger], timer: makeTimer({ taskId: task.id }) }), {
      versions: {
        "task:delete-task": { updatedAt: 51, rev: 91 },
        "entry:delete-entry": { updatedAt: 52, rev: 92 },
        "ledger:delete-ledger": { updatedAt: 53, rev: 93 },
        [`timer:${SINGLETON_ID}`]: { updatedAt: 54, rev: 94 },
      },
    })
    const plan = await deleteRecordsTool.plan(ctx, { items: [
      { kind: "task", id: "T-141" }, { kind: "ledger", id: ledger.id }, { kind: "entry", id: entry.id },
    ] })
    expect(deleteRecordsTool.alwaysPreview).toBe(true)
    expect(plan.changes.map(({ kind, beforeRev, action }) => [kind, beforeRev, action])).toEqual([
      ["task", 91, "delete"], ["ledger", 93, "delete"], ["entry", 92, "delete"], ["timer", 94, "delete"],
    ])
    expect(plan.output).toMatchObject({ stoppedTimer: true, deletedTaskIds: [task.id], deleted: [{ kind: "task" }, { kind: "ledger" }, { kind: "entry", record: { task: { id: task.id } } }] })
  })
})
