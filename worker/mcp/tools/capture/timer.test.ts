import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import { closeTimer, startTimerOn } from "../../../../src/domain/operations"
import type { ActiveTimer, Project, Task } from "../../../../src/domain/types"
import { timerTool } from "./timer"
import { captureContext, CAPTURE_NOW } from "./test-support"
import { emptyWorkbench } from "./helpers"

beforeAll(() => {
  process.env.TZ = "UTC"
})

const project: Project = {
  id: "p-1",
  name: "Side project",
  color: "blue",
  stage: "running",
  goal: "",
  startedOn: "2026-01-01",
  monthlyTarget: null,
  milestones: [],
}

const oldTask: Task = {
  id: "t-old",
  seq: 101,
  title: "Previous task",
  projectId: project.id,
  status: "doing",
  priority: 0,
  estimateMin: 30,
  plannedFor: "2026-10-02",
  startAt: null,
  dueOn: null,
  notes: "",
  subtasks: [],
  createdAt: 1,
  completedAt: null,
}

const nextTask: Task = {
  ...oldTask,
  id: "t-next",
  seq: 102,
  title: "Next task",
  status: "todo",
  plannedFor: null,
}

const activeTimer: ActiveTimer = {
  taskId: oldTask.id,
  projectId: project.id,
  label: oldTask.title,
  startedAt: Date.parse("2026-10-02T02:00:00.000Z"),
}

describe("timer", () => {
  it("closes the old timer and starts the selected task with shared operation fields", async () => {
    const ctx = captureContext(
      emptyWorkbench({ projects: [project], tasks: [oldTask, nextTask], timer: activeTimer }),
      { versions: { "task:t-next": { updatedAt: 222, rev: 12 }, "timer:singleton": { updatedAt: 223, rev: 13 } } },
      (prefix) => `${prefix}-shared`
    )
    const plan = await timerTool.plan(ctx, { action: "start", task: "T-102", reason: "Switch focus." })
    const op = { now: ctx.clock.now, today: ctx.clock.today, newId: (prefix: string) => `${prefix}-shared` }
    const direct = startTimerOn(activeTimer, nextTask, op)
    const plannedTask = plan.changes.find((change) => change.kind === "task")?.after as Task
    const plannedEntry = plan.changes.find((change) => change.kind === "entry")?.after as { id: string; origin?: string; taskId: string | null; projectId: string | null; start: number; end: number }
    const plannedTaskFields = { ...plannedTask, id: "" }
    const directTaskFields = { ...direct.task, id: "" }
    const plannedEntryFields = { ...plannedEntry, id: "" }
    delete plannedEntryFields.origin
    const directEntryFields = { ...direct.closedEntry as NonNullable<typeof direct.closedEntry>, id: "" }

    expect(plan.changes).toHaveLength(3)
    expect(plan.changes.map(({ kind, id, action, beforeRev }) => ({ kind, id, action, beforeRev }))).toEqual([
      { kind: "task", id: "t-next", action: "update", beforeRev: 12 },
      { kind: "entry", id: "E-shared", action: "create", beforeRev: null },
      { kind: "timer", id: "singleton", action: "update", beforeRev: 13 },
    ])
    expect(plannedTaskFields).toEqual(directTaskFields)
    expect(plannedEntryFields).toEqual(directEntryFields)
    expect(plannedEntry).toMatchObject({ origin: "ai", taskId: "t-old", projectId: "p-1" })
    expect(plan.changes[0].before).toEqual(nextTask)
    expect(plan.changes[2].before).toEqual(activeTimer)
    expect(plan.output).toMatchObject({
      action: "start",
      timer: {
        task: { id: "t-next", code: "T-102", title: "Next task" },
        project: { id: "p-1", name: "Side project" },
        label: "Next task",
        startedAt: "2026-10-02 12:00",
        runningMin: 0,
      },
      closedEntry: { task: { id: "t-old", code: "T-101", title: "Previous task" }, minutes: 120, byAi: true },
    })
    expect(plan.reason).toBe("Switch focus.")
  })

  it("stops the active timer and writes the shared closed segment", async () => {
    const ctx = captureContext(
      emptyWorkbench({ projects: [project], tasks: [oldTask], timer: activeTimer }),
      { versions: { "timer:singleton": { updatedAt: 400, rev: 29 } } },
      (prefix) => `${prefix}-stop`
    )
    const plan = await timerTool.plan(ctx, { action: "stop" })
    const direct = closeTimer(activeTimer, ctx.clock.now, (prefix) => `${prefix}-stop`)

    expect(direct).not.toBeNull()
    expect(plan.changes.map(({ kind, id, action, beforeRev }) => ({ kind, id, action, beforeRev }))).toEqual([
      { kind: "entry", id: "E-stop", action: "create", beforeRev: null },
      { kind: "timer", id: "singleton", action: "delete", beforeRev: 29 },
    ])
    expect(plan.changes[0].after).toMatchObject({ ...direct, origin: "ai" })
    expect(plan.changes[1].before).toEqual(activeTimer)
    expect(plan.changes[1].after).toBeNull()
    expect(plan.output).toMatchObject({
      action: "stop",
      timer: null,
      closedEntry: { id: "E-stop", task: { id: "t-old", code: "T-101" }, minutes: 120, byAi: true },
    })
  })

  it("status returns the active timer without planned changes", async () => {
    const ctx = captureContext(emptyWorkbench({ projects: [project], tasks: [oldTask], timer: activeTimer }))
    const plan = await timerTool.plan(ctx, { action: "status" })
    expect(plan.changes).toEqual([])
    expect(plan.output).toMatchObject({
      action: "status",
      timer: { task: { id: "t-old", code: "T-101" }, startedAt: "2026-10-02 10:00", runningMin: 120 },
      closedEntry: null,
    })
    expect(ctx.clock.now).toBe(CAPTURE_NOW)
  })
})
