import { addDays, dayKeyOf, weekStart } from "../../../../src/domain/calendar"
import { dayLoad } from "../../../../src/domain/planning"
import { routineMinutesOn } from "../../../../src/domain/routines"
import { isOpen, minutesOf, OPEN_STATUSES, sortTasks } from "../../../../src/domain/tasks"
import { toWallWorkbench } from "../../data/wall"
import { assertDay } from "../shared/dates"
import { DAY } from "../shared/schema"
import { presentTask, presentationContext, scheduleOrder, values, weekdayOf } from "./common"
import type { ReadTool } from "../../types"

interface GetWeekInput {
  date?: string
}

export const getWeekTool: ReadTool<GetWeekInput> = {
  kind: "read",
  name: "get_week",
  title: "Get week",
  description: "Read the seven-day plan, workload, tracked time, and unscheduled open tasks. Use it to review or organize a selected week.",
  inputSchema: {
    type: "object",
    properties: { date: DAY },
    additionalProperties: false,
  },
  async run(ctx, input) {
    const date = input.date === undefined ? ctx.clock.today : assertDay(input.date, "date")
    const start = weekStart(date)
    const end = addDays(start, 6)
    const [plannedRecords, unplannedRecords, entryRecords, routines, profile, projectRecords] = await Promise.all([
      ctx.data.tasks({ plannedFrom: start, plannedTo: end }),
      ctx.data.tasks({ statuses: OPEN_STATUSES, unplanned: true }),
      ctx.data.entries({ from: ctx.clock.startOfDay(start), to: ctx.clock.startOfDay(addDays(end, 1)) }),
      ctx.data.routines(),
      ctx.data.profile(),
      ctx.data.projects(),
    ])
    const tasks = values(plannedRecords)
    const unplanned = values(unplannedRecords).filter(isOpen)
    const wall = toWallWorkbench({
      profile: profile.value ?? undefined,
      tasks,
      entries: values(entryRecords),
      routines: values(routines),
    }, ctx.clock)
    const present = presentationContext(ctx, projectRecords)
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = addDays(start, index)
      const dayTasks = tasks.filter((task) => task.plannedFor === day && task.status !== "dropped").sort(scheduleOrder)
      const load = dayLoad(wall.tasks, day, wall.profile, routineMinutesOn(wall.routines, day))
      const trackedMin = wall.entries.reduce((sum, entry) => {
        return dayKeyOf(new Date(entry.start)) === day ? sum + minutesOf(entry) : sum
      }, 0)
      return {
        date: day,
        weekday: weekdayOf(day),
        capacityMin: load.capacity,
        plannedMin: load.planned,
        trackedMin,
        tasks: dayTasks.map((task) => presentTask(task, present)),
      }
    })
    const important = sortTasks(unplanned, "priority")

    return {
      weekStart: start,
      weekEnd: end,
      days,
      unscheduled: {
        count: unplanned.length,
        tasks: important.slice(0, 15).map((task) => presentTask(task, present)),
        truncated: unplanned.length > 15,
      },
      truncated: unplanned.length > 15,
    }
  },
}
