import { addDays, minutesToTime, timeToMinutes } from "../../../../src/domain/calendar"
import { planOn, scheduleAt } from "../../../../src/domain/operations"
import { autoSchedule, blocksFor, dayLoad, roundUp, MIN_BLOCK } from "../../../../src/domain/planning"
import { isOpen, isSlipped, suggestForDay } from "../../../../src/domain/tasks"
import { routineMinutesOn } from "../../../../src/domain/routines"
import type { Task } from "../../../../src/domain/types"
import { structurallyEqual, updateChange } from "../shared/changes"
import { presentTask } from "../shared/present"
import { assertDay, assertTime } from "../shared/dates"
import { REASON, TASK_REF } from "../shared/schema"
import { ToolInputError, type PlannedChange, type WriteTool } from "../../types"
import { assertUnique, inputObject, operationContext, optionalReason, presentContext, requiredString, resolveTaskRefs } from "./helpers"

interface BusyInput {
  start: string
  end: string
  label: string
}

function parseBusy(value: unknown, index: number): BusyInput {
  const item = inputObject(value, `busy[${index}]`)
  const start = assertTime(requiredString(item.start, `busy[${index}].start`), `busy[${index}].start`)
  const end = assertTime(requiredString(item.end, `busy[${index}].end`), `busy[${index}].end`)
  const label = requiredString(item.label, `busy[${index}].label`)
  if (timeToMinutes(start) >= timeToMinutes(end)) {
    throw new ToolInputError(`Busy interval ${index + 1} must end after it starts on the same day.`)
  }
  return { start, end, label }
}

function timeLabel(minutes: number): string {
  return minutes >= 24 * 60 ? "24:00" : minutesToTime(minutes)
}

function priorityRank(task: Task): number {
  return task.priority === 0 ? -1 : task.priority
}

function compareTimelineCandidates(a: Task, b: Task): number {
  const dueDate = (task: Task) => task.dueOn ?? "9999-12-31"
  return priorityRank(b) - priorityRank(a) || dueDate(a).localeCompare(dueDate(b)) || a.seq - b.seq
}

export const planDayTool: WriteTool<unknown> = {
  kind: "write",
  name: "plan_day",
  title: "Plan a day",
  description: "Place tasks into the open slots on a day's timeline using the same scheduling algorithm as DeverDesk. Use this when arranging a day's work around existing tasks or busy intervals; changes may be queued for the user's approval.",
  destructive: false,
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Local calendar day in YYYY-MM-DD format." },
      tasks: { type: "array", minItems: 1, maxItems: 20, items: TASK_REF },
      from: { type: "string", description: "Local time in HH:mm format; defaults to now today or the schedule start on other days." },
      busy: {
        type: "array", maxItems: 50,
        items: {
          type: "object", properties: {
            start: { type: "string", description: "Busy interval start in HH:mm local time." },
            end: { type: "string", description: "Busy interval end in HH:mm local time." },
            label: { type: "string", minLength: 1, maxLength: 120 },
          }, required: ["start", "end", "label"], additionalProperties: false,
        },
      },
      dryRun: { type: "boolean", default: false },
      reason: REASON,
    },
    additionalProperties: false,
  },
  async plan(ctx, value) {
    const input = inputObject(value, "plan_day input")
    const date = input.date === undefined ? ctx.clock.today : assertDay(requiredString(input.date, "date"), "date")
    let refs: string[] | undefined
    if (input.tasks !== undefined) {
      if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 20 || input.tasks.some((ref) => typeof ref !== "string")) {
        throw new ToolInputError('Field "tasks" must contain 1–20 task references.')
      }
      refs = input.tasks as string[]
      assertUnique(refs, "tasks")
    }
    if (input.from !== undefined) assertTime(requiredString(input.from, "from"), "from")
    if (input.busy !== undefined && (!Array.isArray(input.busy) || input.busy.length > 50)) {
      throw new ToolInputError('Field "busy" must contain no more than 50 intervals.')
    }
    const busy = (input.busy ?? []).map(parseBusy)
    if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") throw new ToolInputError('Field "dryRun" must be a boolean.')

    const profileVersion = await ctx.data.profile()
    const profile = profileVersion.value
    if (!profile) throw new ToolInputError("Work schedule settings are not available.")
    const routines = await ctx.data.routines()
    const existingVersions = await ctx.data.tasks({ plannedFrom: date, plannedTo: date })
    let candidateVersions = [] as typeof existingVersions
    if (refs) {
      const selected = await resolveTaskRefs(ctx.data, refs)
      candidateVersions = refs.map((ref) => selected.get(ref)).filter((item): item is NonNullable<typeof item> => item !== undefined)
    } else {
      candidateVersions = existingVersions
        .filter(({ value: task }) => isOpen(task) && !task.startAt)
        .sort((a, b) => compareTimelineCandidates(a.value, b.value))
      if (candidateVersions.length === 0) {
        const [unplanned, earlier] = await Promise.all([
          ctx.data.tasks({ statuses: ["backlog", "todo", "doing"], unplanned: true }),
          ctx.data.tasks({ statuses: ["backlog", "todo", "doing"], plannedTo: addDays(date, -1) }),
        ])
        const byId = new Map([...unplanned, ...earlier].map((item) => [item.value.id, item]))
        const available = [...byId.values()].map(({ value: task }) => task)
        const slipped = new Set(available.filter((task) => isSlipped(task, date)).map((task) => task.id))
        const suggestions = suggestForDay(available.filter((task) => task.status !== "backlog"), date, 12)
          .filter((task) => !slipped.has(task.id))
          .slice(0, 5)
        const versions = new Map([...unplanned, ...earlier].map((item) => [item.value.id, item]))
        candidateVersions = suggestions.map((task) => versions.get(task.id)).filter((item): item is NonNullable<typeof item> => item !== undefined)
      }
    }

    const selected = new Map(candidateVersions.map((item) => [item.value.id, item]))
    const notPlaced: { task: Task; reason: string }[] = []
    const eligible: Task[] = []
    for (const { value: task } of candidateVersions) {
      if (!isOpen(task)) {
        notPlaced.push({ task, reason: "Only unfinished tasks can be scheduled." })
      } else if (task.plannedFor === date && task.startAt !== null) {
        notPlaced.push({ task, reason: "This task is already scheduled on the selected day." })
      } else {
        eligible.push(task)
      }
    }

    const existingTasks = existingVersions.map(({ value: task }) => task)
    const busyBlocks = busy.map((interval, index) => ({
      taskId: `busy-${index}-${interval.label}`,
      start: timeToMinutes(interval.start),
      end: timeToMinutes(interval.end),
    }))
    const timelineBlocks = [...blocksFor(existingTasks, date), ...busyBlocks]
    const from = input.from === undefined
      ? date === ctx.clock.today
        ? Math.max(profile.dayStartHour * 60, roundUp(ctx.clock.minuteOfDay(ctx.clock.now)))
        : profile.dayStartHour * 60
      : timeToMinutes(input.from as string)
    const times = autoSchedule(eligible, timelineBlocks, from, profile.dayEndHour * 60)
    const op = operationContext(ctx)
    const projects = await ctx.data.projects()
    const present = presentContext(ctx, projects)
    const placed: { task: Task; start: string; end: string }[] = []
    const changes: PlannedChange[] = []
    for (const task of eligible) {
      const start = times.get(task.id)
      if (!start) {
        notPlaced.push({ task, reason: "No contiguous free timeline slot remains before the schedule ends." })
        continue
      }
      const planned = scheduleAt(planOn(task, date), start, op)
      const startMinute = timeToMinutes(start)
      placed.push({ task: planned, start, end: timeLabel(startMinute + Math.max(MIN_BLOCK, task.estimateMin)) })
      const current = selected.get(task.id)
      if (!input.dryRun && current && !structurallyEqual(task, planned)) {
        changes.push(updateChange("task", task.id, current, planned))
      }
    }

    const afterById = new Map(placed.map(({ task }) => [task.id, task]))
    const dayTasks = [
      ...existingTasks.filter((task) => !afterById.has(task.id)),
      ...placed.map(({ task }) => task),
    ]
    const load = dayLoad(dayTasks, date, profile, routineMinutesOn(routines.map(({ value }) => value), date))
    return {
      changes,
      reason: optionalReason(input),
      output: {
        date,
        placed: placed.map(({ task, start, end }) => ({ task: presentTask(task, present), start, end })),
        notPlaced: notPlaced.map(({ task, reason }) => ({ task: presentTask(task, present), reason })),
        capacity: {
          capacityMin: load.capacity,
          plannedMin: load.planned,
          remainingMin: load.capacity - load.planned,
          overbooked: load.planned > load.capacity,
        },
        dryRun: input.dryRun === true,
      },
    }
  },
}
