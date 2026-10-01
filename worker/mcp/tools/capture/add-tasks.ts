import { newTask, addSubtask, type TaskInput } from "../../../../src/domain/operations"
import { taskCode } from "../../../../src/domain/tasks"
import type { DayKey, Priority, Task, TaskStatus } from "../../../../src/domain/types"
import { createChange } from "../shared/changes"
import { presentTask } from "../shared/present"
import { DAY, ESTIMATE_MIN, NOTES, PROJECT_REF, REASON, TASK_TITLE, TIME } from "../shared/schema"
import type { PlannedChange, SubmitResult, ToolContext, WritePlan, WriteTool } from "../../types"
import { ToolInputError } from "../../types"
import { assertDay, assertTime } from "../shared/dates"
import { makePresentContext, operationContext, resolveProjectId } from "./helpers"

interface AddTaskInput {
  title: string
  project?: string | null
  status?: "backlog" | "todo" | "doing" | "done"
  priority?: Priority
  estimateMin?: number
  plannedFor?: DayKey
  startAt?: string
  dueOn?: DayKey
  notes?: string
  subtasks?: string[]
}

interface AddTasksInput {
  tasks: AddTaskInput[]
  reason?: string
}

function compactTask(task: Task, ctx: ToolContext, projects: Awaited<ReturnType<ToolContext["data"]["projects"]>>) {
  return { ...presentTask(task, makePresentContext(ctx.clock, projects)), code: null }
}

export const addTasksTool: WriteTool<unknown> = {
  kind: "write",
  name: "add_tasks",
  title: "Add tasks",
  description: "Create one or more tasks. Use it when the user wants to capture tasks; changes may be queued for the user's approval.",
  destructive: false,
  inputSchema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            title: TASK_TITLE,
            project: PROJECT_REF,
            status: { type: "string", enum: ["backlog", "todo", "doing", "done"] },
            priority: { type: "integer", minimum: 0, maximum: 4 },
            estimateMin: ESTIMATE_MIN,
            plannedFor: DAY,
            startAt: TIME,
            dueOn: DAY,
            notes: NOTES,
            subtasks: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 80 } },
          },
          required: ["title"],
          additionalProperties: false,
        },
      },
      reason: REASON,
    },
    required: ["tasks"],
    additionalProperties: false,
  },
  async plan(ctx, value): Promise<WritePlan> {
    const input = value as AddTasksInput
    for (const [index, task] of input.tasks.entries()) {
      if (task.title.trim().length === 0) {
        throw new ToolInputError(`tasks[${index}].title cannot be blank after trimming whitespace.`)
      }
      if (task.plannedFor !== undefined) assertDay(task.plannedFor, `tasks[${index}].plannedFor`)
      if (task.dueOn !== undefined) assertDay(task.dueOn, `tasks[${index}].dueOn`)
      if (task.startAt !== undefined) {
        assertTime(task.startAt, `tasks[${index}].startAt`)
        if (task.plannedFor === undefined) {
          throw new ToolInputError(`tasks[${index}].startAt requires tasks[${index}].plannedFor.`)
        }
      }
      if (task.subtasks?.some((title) => title.trim().length === 0)) {
        throw new ToolInputError(`tasks[${index}].subtasks cannot contain an empty title.`)
      }
    }

    const projects = input.tasks.some((task) => typeof task.project === "string")
      ? await ctx.data.projects()
      : []
    const op = operationContext(ctx)
    const changes: PlannedChange[] = []
    const outputTasks: Record<string, unknown>[] = []

    for (const inputTask of input.tasks) {
      const projectId = resolveProjectId(inputTask.project, projects)
      const taskInput: Partial<TaskInput> & { title: string } = {
        title: inputTask.title.trim(),
        projectId,
        status: (inputTask.status ?? "todo") as TaskStatus,
        priority: inputTask.priority ?? 0,
        estimateMin: inputTask.estimateMin ?? 30,
        plannedFor: inputTask.plannedFor ?? null,
        startAt: inputTask.startAt ?? null,
        dueOn: inputTask.dueOn ?? null,
        notes: inputTask.notes ?? "",
      }
      let task = newTask(taskInput, 0, op)
      for (const title of inputTask.subtasks ?? []) task = addSubtask(task, title, op)
      task = { ...task, origin: "ai" }

      const existing = await ctx.data.record("task", task.id)
      changes.push(createChange("task", task.id, task, existing))
      outputTasks.push(compactTask(task, ctx, projects))
    }

    return {
      changes,
      output: { created: changes.length, tasks: outputTasks },
      reason: input.reason ?? null,
    }
  },
  present(_ctx, plan, result: SubmitResult) {
    const output = plan.output as { created: number; tasks: Record<string, unknown>[] }
    const tasks = output.tasks.map((task, index) => {
      const applied = result.status === "applied" ? result.results[index]?.after as Task | null | undefined : undefined
      return applied && typeof applied.seq === "number"
        ? { ...task, code: taskCode(applied) }
        : task
    })
    return { ...output, tasks }
  },
}
