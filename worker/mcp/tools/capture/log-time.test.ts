import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import { logTimeEntry } from "../../../../src/domain/operations"
import type { Project, Task } from "../../../../src/domain/types"
import { logTimeTool } from "./log-time"
import { captureContext } from "./test-support"
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

const task: Task = {
  id: "t-1",
  seq: 101,
  title: "Implement capture",
  projectId: project.id,
  status: "doing",
  priority: 2,
  estimateMin: 30,
  plannedFor: "2026-10-02",
  startAt: null,
  dueOn: null,
  notes: "",
  subtasks: [],
  createdAt: 1,
  completedAt: null,
}

describe("log_time", () => {
  it("converts local time and matches the shared manual time operation", async () => {
    const ctx = captureContext(emptyWorkbench({ projects: [project], tasks: [task] }), {}, () => "E-time-test")
    const plan = await logTimeTool.plan(ctx, {
      entries: [{ start: "2026-10-02T10:00", minutes: 60, task: "T-101" }],
      reason: "Record the focused session.",
    })
    const entry = plan.changes[0].after as { id: string; origin?: string; start: number; end: number; taskId: string | null; projectId: string | null }
    const localEnd = ctx.clock.parseLocal("2026-10-02T11:00")
    const direct = logTimeEntry(task, 60, {
      now: localEnd as number,
      today: ctx.clock.today,
      newId: () => "E-time-test",
    })

    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]).toMatchObject({
      kind: "entry",
      id: "E-time-test",
      action: "create",
      before: null,
      beforeUpdatedAt: null,
      beforeRev: null,
      after: { taskId: "t-1", projectId: "p-1", origin: "ai" },
    })
    expect(entry).toMatchObject({ start: ctx.clock.parseLocal("2026-10-02T10:00"), end: localEnd })
    expect(direct).not.toBeNull()
    expect({ ...entry, id: undefined, origin: undefined }).toEqual({ ...direct, id: undefined })
    expect(plan.output).toMatchObject({
      created: [{
        id: "E-time-test",
        start: "2026-10-02 10:00",
        end: "2026-10-02 11:00",
        minutes: 60,
        project: { id: "p-1", name: "Side project" },
        task: { id: "t-1", code: "T-101", title: "Implement capture" },
        byAi: true,
      }],
    })
    expect(plan.reason).toBe("Record the focused session.")
  })

  it("supports full-date and time-only intervals across midnight", async () => {
    const ctx = captureContext(emptyWorkbench({ projects: [project], tasks: [task] }), {}, (prefix, index) => `${prefix}-overnight-${index}`)
    const plan = await logTimeTool.plan(ctx, {
      entries: [
        { start: "2026-10-01T23:00", end: "2026-10-02T01:00" },
        { start: "23:00", end: "01:00", date: "2026-10-01" },
      ],
    })
    const start = ctx.clock.parseLocal("2026-10-01T23:00")
    const end = ctx.clock.parseLocal("2026-10-02T01:00")
    const entries = plan.changes.map(({ after }) => {
      const { start, end } = after as { start: number; end: number }
      return { start, end }
    })

    expect(entries).toEqual([{ start, end }, { start, end }])
    expect(plan.output).toMatchObject({
      created: [
        { start: "2026-10-01 23:00", end: "2026-10-02 01:00", minutes: 120 },
        { start: "2026-10-01 23:00", end: "2026-10-02 01:00", minutes: 120 },
      ],
    })
  })

  it("says which of end and minutes is wrong when both or neither are given", async () => {
    const ctx = captureContext()
    await expect(logTimeTool.plan(ctx, {
      entries: [{ start: "2026-10-01T10:00", minutes: 30, end: "2026-10-01T10:30" }],
    })).rejects.toThrow('entries[0] must provide exactly one of "end" or "minutes" (both were given).')
    await expect(logTimeTool.plan(ctx, {
      entries: [{ start: "2026-10-01T10:00" }],
    })).rejects.toThrow('exactly one of "end" or "minutes" (neither was given).')
  })

  it("still rejects intervals longer than a day and ends in the future", async () => {
    const ctx = captureContext()
    await expect(logTimeTool.plan(ctx, {
      entries: [{ start: "2026-10-01T00:00", end: "2026-10-02T00:01" }],
    })).rejects.toThrow("cannot be longer than 24 hours")
    await expect(logTimeTool.plan(ctx, {
      entries: [{ start: "11:30", end: "12:30", date: "2026-10-02" }],
    })).rejects.toThrow("cannot be in the future")
  })
})
