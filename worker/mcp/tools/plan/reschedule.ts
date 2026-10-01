import { addDays } from "../../../../src/domain/calendar"
import { patchTask, type TaskInput } from "../../../../src/domain/operations"
import { isOpen, matchPlanWindow, OPEN_STATUSES } from "../../../../src/domain/tasks"
import type { DayKey, Task } from "../../../../src/domain/types"
import { structurallyEqual, updateChange } from "../shared/changes"
import { presentTask } from "../shared/present"
import { assertDay } from "../shared/dates"
import { REASON, TASK_REF } from "../shared/schema"

import { ToolInputError, type PlannedChange, type Versioned, type WriteTool } from "../../types"
import { assertUnique, inputObject, optionalReason, presentContext, requiredString, resolveTaskRefs } from "./helpers"

interface RescheduleSelector {
  overdue?: boolean
  plannedOn?: DayKey
  plannedFrom?: DayKey
}

function parseSelector(value: unknown): RescheduleSelector {
  const input = inputObject(value, "selector")
  const selector: RescheduleSelector = {}
  if (input.overdue !== undefined) {
    if (typeof input.overdue !== "boolean") throw new ToolInputError('Field "selector.overdue" must be a boolean.')
    selector.overdue = input.overdue
  }
  if (input.plannedOn !== undefined) selector.plannedOn = assertDay(requiredString(input.plannedOn, "selector.plannedOn"), "selector.plannedOn")
  if (input.plannedFrom !== undefined) selector.plannedFrom = assertDay(requiredString(input.plannedFrom, "selector.plannedFrom"), "selector.plannedFrom")
  if (selector.overdue !== true && selector.plannedOn === undefined && selector.plannedFrom === undefined) {
    throw new ToolInputError('Selector must include overdue: true, plannedOn, or plannedFrom.')
  }
  return selector
}

function matchesSelector(task: Task, selector: RescheduleSelector, today: DayKey): boolean {
  return (selector.overdue === true && matchPlanWindow(task, "overdue", today)) ||
    (selector.plannedOn !== undefined && task.plannedFor === selector.plannedOn) ||
    (selector.plannedFrom !== undefined && task.plannedFor !== null && task.plannedFor >= selector.plannedFrom)
}

export const rescheduleTool: WriteTool<unknown> = {
  kind: "write",
  name: "reschedule",
  title: "Reschedule tasks",
  description: "Move unfinished tasks to a different planned day while applying the same timeline-clearing rule as the interface. Use this for overdue work, a selected day range, or a relative shift; changes may be queued for the user's approval.",
  destructive: true,
  inputSchema: {
    type: "object",
    properties: {
      tasks: { type: "array", minItems: 1, maxItems: 20, items: TASK_REF, description: "Tasks to move. Give either tasks or selector, not both." },
      selector: {
        type: "object",
        description: "Pick tasks by rule instead of listing them. Give either selector or tasks, not both; it needs at least one of overdue: true, plannedOn, plannedFrom.",
        properties: {
          overdue: { type: "boolean", description: "true selects every overdue unfinished task." },
          plannedOn: { type: "string", description: "Select tasks planned on this local day." },
          plannedFrom: { type: "string", description: "Select tasks planned on or after this local day." },
        },
        additionalProperties: false,
      },
      to: { type: "string", description: "Target local calendar day, YYYY-MM-DD. Give either to or shiftDays, not both." },
      shiftDays: { type: "integer", minimum: -30, maximum: 30, description: "Move each task by this many days: a non-zero integer from -30 to 30 (tasks without a planned day are skipped). Give either shiftDays or to, not both." },
      keepTime: { type: "boolean", default: false },
      reason: REASON,
    },
    additionalProperties: false,
  },
  async plan(ctx, value) {
    const input = inputObject(value, "reschedule input")
    if ((input.tasks === undefined) === (input.selector === undefined)) {
      throw new ToolInputError('Provide either "tasks" or "selector", but not both.')
    }
    if ((input.to === undefined) === (input.shiftDays === undefined)) {
      throw new ToolInputError('Provide exactly one of "to" or "shiftDays".')
    }
    let selector: RescheduleSelector | undefined
    let selected: Versioned<Task>[]
    if (input.tasks !== undefined) {
      if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 20 || input.tasks.some((ref) => typeof ref !== "string")) {
        throw new ToolInputError('Field "tasks" must contain 1–20 task references.')
      }
      const refs = input.tasks as string[]
      assertUnique(refs, "tasks")
      const resolved = await resolveTaskRefs(ctx.data, refs)
      selected = refs.map((ref) => resolved.get(ref)).filter((item): item is NonNullable<typeof item> => item !== undefined)
    } else {
      selector = parseSelector(input.selector)
      const queries: Promise<Versioned<Task>[]>[] = []
      if (selector.overdue) {
        const dayBefore = addDays(ctx.clock.today, -1)
        queries.push(ctx.data.tasks({ statuses: OPEN_STATUSES, dueTo: dayBefore }))
        queries.push(ctx.data.tasks({ statuses: ["todo", "doing"], plannedTo: dayBefore }))
      }
      if (selector.plannedOn) queries.push(ctx.data.tasks({ plannedFrom: selector.plannedOn, plannedTo: selector.plannedOn }))
      if (selector.plannedFrom) queries.push(ctx.data.tasks({ plannedFrom: selector.plannedFrom }))
      const groups = await Promise.all(queries)
      const byId = new Map(groups.flat().map((item) => [item.value.id, item]))
      selected = [...byId.values()]
        .filter(({ value: task }) => matchesSelector(task, selector as RescheduleSelector, ctx.clock.today))
        .sort((a, b) => a.value.seq - b.value.seq)
    }
    if (input.to !== undefined) assertDay(requiredString(input.to, "to"), "to")
    if (input.shiftDays !== undefined && (!Number.isInteger(input.shiftDays) || input.shiftDays === 0 || Math.abs(input.shiftDays as number) > 30)) {
      throw new ToolInputError('Field "shiftDays" must be a non-zero integer from -30 to 30.')
    }
    if (input.keepTime !== undefined && typeof input.keepTime !== "boolean") throw new ToolInputError('Field "keepTime" must be a boolean.')

    const projects = await ctx.data.projects()
    const present = presentContext(ctx, projects)
    const keepTime = input.keepTime === true
    const moved: { task: Task; from: DayKey | null; to: DayKey }[] = []
    const skipped: { task: Task; reason: string }[] = []
    const changes: PlannedChange[] = []
    for (const current of selected) {
      const task = current.value
      if (!isOpen(task)) {
        skipped.push({ task, reason: "Completed or dropped tasks are not rescheduled." })
        continue
      }
      if (input.shiftDays !== undefined && task.plannedFor === null) {
        skipped.push({ task, reason: "A relative shift requires the task to have a planned day." })
        continue
      }
      const target = input.to !== undefined
        ? input.to as DayKey
        : addDays(task.plannedFor as DayKey, input.shiftDays as number)
      const patch: Partial<TaskInput> = { plannedFor: target, startAt: keepTime ? task.startAt : null }
      const after = patchTask(task, patch, { now: ctx.clock.now, today: ctx.clock.today, newId: ctx.newId })
      moved.push({ task: after, from: task.plannedFor, to: target })
      if (!structurallyEqual(task, after)) changes.push(updateChange("task", task.id, current, after))
    }
    if (changes.length > 20) throw new ToolInputError("Rescheduling would exceed the 20-change limit.")
    return {
      changes,
      reason: optionalReason(input),
      output: {
        moved: moved.map(({ task, from, to }) => ({ task: presentTask(task, present), from, to })),
        skipped: skipped.map(({ task, reason }) => ({ task: presentTask(task, present), reason })),
        keepTime,
      },
    }
  },
}
