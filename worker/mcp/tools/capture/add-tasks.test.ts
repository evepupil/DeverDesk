import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import { newTask } from "../../../../src/domain/operations"
import type { Task } from "../../../../src/domain/types"
import type { SubmitResult } from "../../types"
import { ToolInputError } from "../../types"
import { addTasksTool } from "./add-tasks"
import { captureContext } from "./test-support"

beforeAll(() => {
  process.env.TZ = "UTC"
})

function withoutAiIdentity(task: Task) {
  const fields = { ...task, id: "", seq: 0 }
  delete fields.origin
  return fields
}

describe("add_tasks", () => {
  it("plans common-operation defaults and fills the allocated display code after apply", async () => {
    const ctx = captureContext(undefined, {}, (prefix) => `${prefix}-new`)
    const input = { tasks: [{ title: " Capture this " }], reason: "The user asked to track it." }
    const plan = await addTasksTool.plan(ctx, input)
    const task = plan.changes[0].after as Task
    const direct = newTask({
      title: " Capture this ",
      projectId: null,
      status: "todo",
      priority: 0,
      estimateMin: 30,
      plannedFor: null,
      startAt: null,
      dueOn: null,
      notes: "",
    }, 0, { now: ctx.clock.now, today: ctx.clock.today, newId: (prefix) => `${prefix}-new` })

    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]).toMatchObject({
      kind: "task",
      id: "t-new",
      action: "create",
      before: null,
      beforeUpdatedAt: null,
      beforeRev: null,
      after: { seq: 0, title: "Capture this", status: "todo", priority: 0, estimateMin: 30, origin: "ai" },
    })
    expect(withoutAiIdentity(task)).toEqual(withoutAiIdentity(direct))
    expect(plan.output).toMatchObject({
      created: 1,
      tasks: [{ id: "t-new", code: null, title: "Capture this", byAi: true, status: "todo", estimateMin: 30 }],
    })
    expect(plan.reason).toBe("The user asked to track it.")

    const applied = { ...task, seq: 137 }
    const result: SubmitResult = {
      changesetId: "changeset-1",
      status: "applied",
      results: [{ seq: 0, kind: "task", id: task.id, state: "applied", after: applied }],
      conflicts: [],
    }
    expect(addTasksTool.present?.(ctx, plan, result)).toMatchObject({ tasks: [{ id: "t-new", code: "T-137" }] })
  })

  it("rejects a title that is blank after trimming", async () => {
    const ctx = captureContext()
    await expect(addTasksTool.plan(ctx, { tasks: [{ title: "  \t\n " }] }))
      .rejects.toBeInstanceOf(ToolInputError)
  })

  it("keeps a null code while the change is only proposed", async () => {
    const ctx = captureContext()
    const plan = await addTasksTool.plan(ctx, { tasks: [{ title: "Waiting" }] })
    const result: SubmitResult = {
      changesetId: "changeset-pending",
      status: "proposed",
      results: [{ seq: 0, kind: "task", id: "t-capture-0", state: "pending", after: null }],
      conflicts: [],
    }
    expect(addTasksTool.present?.(ctx, plan, result)).toMatchObject({ tasks: [{ code: null }] })
  })
})
