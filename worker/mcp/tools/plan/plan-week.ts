import { addDays, weekDays, weekStart } from "../../../../src/domain/calendar"
import { planOn } from "../../../../src/domain/operations"
import { capacityFor, dayLoad, distributeWeek } from "../../../../src/domain/planning"
import { routineMinutesOn } from "../../../../src/domain/routines"
import { isOpen } from "../../../../src/domain/tasks"
import type { DayKey, Task } from "../../../../src/domain/types"
import { structurallyEqual, updateChange } from "../shared/changes"
import { presentTask } from "../shared/present"
import { assertDay } from "../shared/dates"
import { REASON, TASK_REF } from "../shared/schema"
import { ToolInputError, type PlannedChange, type Versioned, type WriteTool } from "../../types"
import { assertUnique, inputObject, optionalReason, presentContext, requiredString, resolveTaskRefs } from "./helpers"

function priorityRank(task: Task): number {
  return task.priority === 0 ? -1 : task.priority
}

function compareWeekCandidates(a: Task, b: Task): number {
  const dueDate = (task: Task) => task.dueOn ?? "9999-12-31"
  return dueDate(a).localeCompare(dueDate(b)) || priorityRank(b) - priorityRank(a) || a.seq - b.seq
}

export const planWeekTool: WriteTool<unknown> = {
  kind: "write",
  name: "plan_week",
  title: "Plan a week",
  description: "Distribute tasks across the week's remaining daily capacity while respecting due dates. Use this when assigning work to a week without choosing timeline start times; changes may be queued for the user's approval.",
  destructive: false,
  inputSchema: {
    type: "object",
    properties: {
      weekOf: { type: "string", description: "Any local calendar day in the target week, YYYY-MM-DD." },
      tasks: { type: "array", minItems: 1, maxItems: 20, items: TASK_REF },
      dryRun: { type: "boolean", default: false },
      reason: REASON,
    },
    additionalProperties: false,
  },
  async plan(ctx, value) {
    const input = inputObject(value, "plan_week input")
    const anchor = input.weekOf === undefined ? ctx.clock.today : assertDay(requiredString(input.weekOf, "weekOf"), "weekOf")
    const start = weekStart(anchor)
    const days = weekDays(start)
    let selectedVersions: Versioned<Task>[]
    let skipped = 0
    if (input.tasks !== undefined) {
      if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 20 || input.tasks.some((ref) => typeof ref !== "string")) {
        throw new ToolInputError('Field "tasks" must contain 1–20 task references.')
      }
      const refs = input.tasks as string[]
      assertUnique(refs, "tasks")
      const resolved = await resolveTaskRefs(ctx.data, refs)
      selectedVersions = refs.map((ref) => resolved.get(ref)).filter((item): item is NonNullable<typeof item> => item !== undefined)
    } else {
      const candidates = await ctx.data.tasks({ statuses: ["todo", "doing"], unplanned: true })
      candidates.sort((a, b) => compareWeekCandidates(a.value, b.value))
      skipped = Math.max(0, candidates.length - 20)
      selectedVersions = candidates.slice(0, 20)
    }
    if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") throw new ToolInputError('Field "dryRun" must be a boolean.')

    const [profileVersion, routines, scheduledVersions] = await Promise.all([
      ctx.data.profile(),
      ctx.data.routines(),
      ctx.data.tasks({ plannedFrom: start, plannedTo: addDays(start, 6) }),
    ])
    const profile = profileVersion.value
    if (!profile) throw new ToolInputError("Work schedule settings are not available.")
    const selectedIds = new Set(selectedVersions.filter(({ value: task }) => isOpen(task)).map(({ value: task }) => task.id))
    const baselineTasks = scheduledVersions.map(({ value: task }) => task).filter((task) => !selectedIds.has(task.id))
    const routineValues = routines.map(({ value }) => value)
    const remaining = Object.fromEntries(days.map((day) => {
      const routineMinutes = routineMinutesOn(routineValues, day)
      const load = dayLoad(baselineTasks, day, profile, routineMinutes)
      return [day, capacityFor(day, profile) - load.planned]
    })) as Record<DayKey, number>

    const unfinished: Task[] = []
    const notPlaced: { task: Task; reason: string }[] = []
    for (const { value: task } of selectedVersions) {
      if (!isOpen(task)) notPlaced.push({ task, reason: "Only unfinished tasks can be assigned to the week." })
      else unfinished.push(task)
    }
    const result = distributeWeek(unfinished, days, remaining, ctx.clock.today)
    notPlaced.push(...result.notPlaced)
    const projects = await ctx.data.projects()
    const present = presentContext(ctx, projects)
    const placements = result.placed.map((assignment) => ({
      task: planOn(assignment.task, assignment.day),
      day: assignment.day,
      overbooked: assignment.overbooked,
    }))
    const changes: PlannedChange[] = []
    if (input.dryRun !== true) {
      for (const placement of placements) {
        const current = selectedVersions.find(({ value: task }) => task.id === placement.task.id)
        if (current && !structurallyEqual(current.value, placement.task)) {
          changes.push(updateChange("task", placement.task.id, current, placement.task))
        }
      }
    }
    if (changes.length > 20) throw new ToolInputError("Planning a week would exceed the 20-change limit.")

    const placedMinutes = new Map<DayKey, number>()
    for (const placement of placements) placedMinutes.set(placement.day, (placedMinutes.get(placement.day) ?? 0) + placement.task.estimateMin)
    const dayOutput = days.map((day) => {
      const base = remaining[day]
      const assigned = placedMinutes.get(day) ?? 0
      return {
        date: day,
        capacityMin: capacityFor(day, profile),
        remainingMin: base - assigned,
        assignedMin: assigned,
        overbooked: base - assigned < 0,
      }
    })
    return {
      changes,
      reason: optionalReason(input),
      output: {
        weekStart: start,
        weekEnd: addDays(start, 6),
        placed: placements.map(({ task, day, overbooked }) => ({ task: presentTask(task, present), day, overbooked })),
        notPlaced: notPlaced.map(({ task, reason }) => ({ task: presentTask(task, present), reason })),
        skipped,
        days: dayOutput,
        dryRun: input.dryRun === true,
      },
    }
  },
}
