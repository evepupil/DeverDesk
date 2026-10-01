import { withStatus, patchTask, addSubtask, toggleSubtask, timerStopsWith, type TaskInput } from "../../../../src/domain/operations"
import { taskCode } from "../../../../src/domain/tasks"
import type { Priority, TaskStatus, Task } from "../../../../src/domain/types"
import { closeTimer as stopTimer } from "../../../../src/domain/operations/timer"
import type { CompactEntry } from "../shared/present"
import { createChange, singletonChange, structurallyEqual, updateChange } from "../shared/changes"
import { resolveProject } from "../shared/refs"
import { presentEntry, presentTask } from "../shared/present"
import { DAY, ESTIMATE_MIN, NOTES, PRIORITY, PROJECT_REF, REASON, TASK_REF, TASK_STATUS, TASK_TITLE } from "../shared/schema"
import { assertDay, assertTime } from "../shared/dates"
import { ToolInputError, type WriteTool } from "../../types"
import { assertUnique, inputObject, operationContext, optionalReason, presentContext, requiredString, resolveTaskRefs } from "./helpers"

interface TaskUpdate {
  task: string
  title?: string
  status?: TaskStatus
  priority?: Priority
  estimateMin?: number
  plannedFor?: string | null
  startAt?: string | null
  dueOn?: string | null
  project?: string | null
  notes?: string
  appendNotes?: string
  addSubtasks?: string[]
  completeSubtasks?: string[]
  reopenSubtasks?: string[]
  removeSubtasks?: string[]
}

const mutableFields = [
  "title", "status", "priority", "estimateMin", "plannedFor", "startAt", "dueOn", "project", "notes",
  "appendNotes", "addSubtasks", "completeSubtasks", "reopenSubtasks", "removeSubtasks",
] as const

function parseUpdate(value: unknown): TaskUpdate {
  const item = inputObject(value, "task update")
  const task = requiredString(item.task, "updates[].task")
  if (!mutableFields.some((field) => field in item)) {
    throw new ToolInputError(`Task update for "${task}" must include at least one field to change.`)
  }
  const update: TaskUpdate = { task }
  if ("title" in item) {
    update.title = requiredString(item.title, "title")
    if (update.title.trim().length > 80) throw new ToolInputError('Field "title" must be at most 80 characters.')
  }
  if ("status" in item) {
    if (!["backlog", "todo", "doing", "done", "dropped"].includes(item.status as string)) throw new ToolInputError('Invalid task status.')
    update.status = item.status as TaskStatus
  }
  if ("priority" in item) {
    if (!Number.isInteger(item.priority) || (item.priority as number) < 0 || (item.priority as number) > 4) throw new ToolInputError('Field "priority" must be an integer from 0 to 4.')
    update.priority = item.priority as Priority
  }
  if ("estimateMin" in item) {
    if (!Number.isInteger(item.estimateMin) || (item.estimateMin as number) < 0 || (item.estimateMin as number) > 1440) throw new ToolInputError('Field "estimateMin" must be an integer from 0 to 1440.')
    update.estimateMin = item.estimateMin as number
  }
  if ("plannedFor" in item) update.plannedFor = item.plannedFor === null ? null : assertDay(requiredString(item.plannedFor, "plannedFor"), "plannedFor")
  if ("startAt" in item) update.startAt = item.startAt === null ? null : assertTime(requiredString(item.startAt, "startAt"), "startAt")
  if ("dueOn" in item) update.dueOn = item.dueOn === null ? null : assertDay(requiredString(item.dueOn, "dueOn"), "dueOn")
  if ("project" in item) {
    if (item.project !== null && typeof item.project !== "string") throw new ToolInputError('Field "project" must be a project reference or null.')
    update.project = item.project as string | null
  }
  if ("notes" in item) {
    if (typeof item.notes !== "string" || item.notes.length > 2000) throw new ToolInputError('Field "notes" must be a string of at most 2000 characters.')
    update.notes = item.notes
  }
  if ("appendNotes" in item) {
    if (typeof item.appendNotes !== "string" || item.appendNotes.length > 2000) throw new ToolInputError('Field "appendNotes" must be a string of at most 2000 characters.')
    update.appendNotes = item.appendNotes
  }
  for (const field of ["addSubtasks", "completeSubtasks", "reopenSubtasks", "removeSubtasks"] as const) {
    if (!(field in item)) continue
    const value = item[field]
    if (!Array.isArray(value) || value.some((ref) => typeof ref !== "string" || ref.trim().length === 0)) {
      throw new ToolInputError(`Field "${field}" must be an array of non-empty strings.`)
    }
    if (field === "addSubtasks" && (value as string[]).some((title) => title.trim().length > 80)) {
      throw new ToolInputError('Subtask titles must be at most 80 characters.')
    }
    update[field] = value as string[]
  }
  return update
}

/** 指向已有子任务的引用列表：编号、序号或标题，都能从读到的任务的 subtasks.items 里看到 */
function subtaskRefs(verb: string) {
  return {
    type: "array",
    maxItems: 20,
    items: { type: "string", minLength: 1 },
    description: `Subtasks to ${verb}, each given as the subtask id, its 1-based position, or its exact title (all shown in the task's subtasks.items).`,
  } as const
}

function subtaskId(task: Task, ref: string): string {
  const normalized = ref.trim()
  const byId = task.subtasks.find((subtask) => subtask.id === normalized)
  if (byId) return byId.id
  if (/^\d+$/.test(normalized)) {
    const position = Number(normalized) - 1
    if (position >= 0 && position < task.subtasks.length) return task.subtasks[position].id
  }
  const matches = task.subtasks.filter((subtask) => subtask.title.toLowerCase() === normalized.toLowerCase())
  if (matches.length === 1) return matches[0].id
  if (matches.length > 1) throw new ToolInputError(`Ambiguous subtask reference "${ref}" on task ${taskCode(task)}.`)
  throw new ToolInputError(`Subtask "${ref}" was not found on task ${taskCode(task)}.`)
}

export const updateTasksTool: WriteTool<unknown> = {
  kind: "write",
  name: "update_tasks",
  title: "Update tasks",
  description: "Update fields on one or more tasks using the same rules as the DeverDesk interface. Use this when task details, subtasks, or status need changes; changes may be queued for the user's approval.",
  destructive: true,
  inputSchema: {
    type: "object",
    properties: {
      updates: {
        type: "array", minItems: 1, maxItems: 20,
        description: "Each update names a task and at least one field to change.",
        items: {
          type: "object",
          properties: {
            task: TASK_REF, title: TASK_TITLE, status: TASK_STATUS, priority: PRIORITY, estimateMin: ESTIMATE_MIN,
            plannedFor: { anyOf: [DAY, { type: "null" }] }, startAt: { anyOf: [{ type: "string", description: "Local time in HH:mm format." }, { type: "null" }] },
            dueOn: { anyOf: [DAY, { type: "null" }] }, project: PROJECT_REF,
            notes: { ...NOTES, description: "Replaces the whole note text (read the task's current notes first if any must be kept). Use appendNotes to add to it instead." },
            appendNotes: { type: "string", maxLength: 2000, description: "Text added to the end of the existing notes, on a new line." },
            addSubtasks: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 80 }, description: "Titles of new subtasks to add." },
            completeSubtasks: subtaskRefs("mark done"),
            reopenSubtasks: subtaskRefs("mark not done"),
            removeSubtasks: subtaskRefs("remove"),
          },
          required: ["task"], additionalProperties: false,
        },
      },
      reason: REASON,
    },
    required: ["updates"], additionalProperties: false,
  },
  async plan(ctx, value) {
    const input = inputObject(value, "update_tasks input")
    if (!Array.isArray(input.updates) || input.updates.length < 1 || input.updates.length > 20) {
      throw new ToolInputError('Field "updates" must contain 1–20 task updates.')
    }
    const updates = input.updates.map(parseUpdate)
    assertUnique(updates.map(({ task }) => task), "updates[].task")
    const tasks = await resolveTaskRefs(ctx.data, updates.map(({ task }) => task))
    const projects = await ctx.data.projects()
    const timer = await ctx.data.timer()
    const op = operationContext(ctx)
    const present = presentContext(ctx, projects)
    const changes = []
    const outputTasks: Task[] = []
    let stoppedTimer = false
    const loggedEntries: CompactEntry[] = []

    for (const update of updates) {
      const current = tasks.get(update.task)
      if (!current) throw new ToolInputError(`Task not found: "${update.task}".`)
      const before = current.value
      const patch: Partial<TaskInput> = {}
      if (update.title !== undefined) patch.title = update.title
      if (update.priority !== undefined) patch.priority = update.priority
      if (update.estimateMin !== undefined) patch.estimateMin = update.estimateMin
      if (update.plannedFor !== undefined) patch.plannedFor = update.plannedFor
      if (update.startAt !== undefined) patch.startAt = update.startAt
      if (update.dueOn !== undefined) patch.dueOn = update.dueOn
      if (update.project !== undefined) patch.projectId = resolveProject(update.project, projects)?.value.id ?? null
      if (update.notes !== undefined) patch.notes = update.notes
      if (update.appendNotes !== undefined && update.appendNotes.length > 0) {
        const base = typeof patch.notes === "string" ? patch.notes : before.notes
        patch.notes = base.length > 0 ? `${base}\n${update.appendNotes}` : update.appendNotes
      }
      if (typeof patch.notes === "string" && patch.notes.length > 2000) {
        throw new ToolInputError(`Appending notes to ${taskCode(before)} would exceed the 2000-character limit.`)
      }
      const plannedDay = update.plannedFor === undefined ? before.plannedFor : update.plannedFor
      if (update.startAt !== undefined && update.startAt !== null && plannedDay === null) {
        throw new ToolInputError(`Task ${taskCode(before)} needs a planned day before setting a start time.`)
      }
      let after = patchTask(before, patch, op)
      for (const title of update.addSubtasks ?? []) after = addSubtask(after, title, op)
      for (const ref of update.completeSubtasks ?? []) {
        const id = subtaskId(after, ref)
        const subtask = after.subtasks.find((item) => item.id === id)
        if (subtask && !subtask.done) after = toggleSubtask(after, id)
      }
      for (const ref of update.reopenSubtasks ?? []) {
        const id = subtaskId(after, ref)
        const subtask = after.subtasks.find((item) => item.id === id)
        if (subtask?.done) after = toggleSubtask(after, id)
      }
      const removedSubtaskIds = new Set((update.removeSubtasks ?? []).map((ref) => subtaskId(after, ref)))
      if (removedSubtaskIds.size > 0) {
        after = { ...after, subtasks: after.subtasks.filter(({ id }) => !removedSubtaskIds.has(id)) }
      }
      const statusChanged = update.status !== undefined && update.status !== before.status
      if (statusChanged) after = withStatus(after, update.status!, op)
      if (after.startAt && !after.plannedFor) {
        throw new ToolInputError(`Task ${taskCode(before)} cannot have a start time without a planned day.`)
      }
      outputTasks.push(after)
      if (!structurallyEqual(before, after)) changes.push(updateChange("task", before.id, current, after))

      if (statusChanged && timerStopsWith(timer.value, before.id, update.status!)) {
        const entry = stopTimer(timer.value, ctx.clock.now, ctx.newId)
        const stopped = singletonChange("timer", timer, null)
        if (stopped) changes.push(stopped)
        stoppedTimer = true
        if (entry) {
          const logged = { ...entry, origin: "ai" as const }
          changes.push(createChange("entry", logged.id, logged))
          loggedEntries.push(presentEntry(logged, present, new Map(outputTasks.map((task) => [task.id, task]))))
        }
      }
    }
    return {
      changes,
      reason: optionalReason(input),
      output: {
        updated: outputTasks.map((task) => presentTask(task, present)),
        stoppedTimer,
        loggedEntries,
      },
    }
  },
}

export const updateTasksSchemaFields = { DAY, ESTIMATE_MIN, NOTES }
