import { addDays, monthEnd, monthStart } from "../../../../src/domain/calendar"
import { profileCurrency } from "../../../../src/domain/format"
import { totals, overduePending } from "../../../../src/domain/ledger"
import { dayLoad } from "../../../../src/domain/planning"
import { isDone, isDueOn, routineMinutesOn, streak } from "../../../../src/domain/routines"
import { isOpen, isOverdue, isSlipped, minutesOf, OPEN_STATUSES, sortTasks } from "../../../../src/domain/tasks"
import type { Task } from "../../../../src/domain/types"
import { toWallWorkbench } from "../../data/wall"
import { DAY } from "../shared/schema"
import { assertDay } from "../shared/dates"
import { roundMoney } from "../shared/numbers"
import { presentEntry, presentLedger, presentTask, presentationContext, scheduleOrder, taskMap, values, weekdayOf } from "./common"
import type { ReadTool } from "../../types"

interface GetDayInput {
  date?: string
}

export const getDayTool: ReadTool<GetDayInput> = {
  kind: "read",
  name: "get_day",
  title: "Get day",
  description: "Read a day's plan, workload, tracked time, routines, timer, and monthly money. Use it to understand today's situation or inspect a specific date.",
  inputSchema: {
    type: "object",
    properties: { date: DAY },
    additionalProperties: false,
  },
  async run(ctx, input) {
    const date = input.date === undefined ? ctx.clock.today : assertDay(input.date, "date")
    const nextDay = addDays(date, 1)
    const month = monthStart(date)
    const monthLast = monthEnd(date)
    const [plannedRecords, overdueDueRecords, dueSoonRecords, slippedRecords, entryRecords, projectRecords, routineRecords, profile, timer, monthLedger, pendingLedger] = await Promise.all([
      ctx.data.tasks({ plannedFrom: date, plannedTo: date }),
      ctx.data.tasks({ statuses: OPEN_STATUSES, dueTo: addDays(date, -1), orderBy: "priority", limit: 21 }),
      ctx.data.tasks({ statuses: OPEN_STATUSES, dueFrom: date, dueTo: addDays(date, 3), orderBy: "due", limit: 11 }),
      ctx.data.tasks({ statuses: ["todo", "doing"], plannedTo: addDays(date, -1), orderBy: "priority", limit: 21 }),
      ctx.data.entries({ from: ctx.clock.startOfDay(date), to: ctx.clock.startOfDay(nextDay) }),
      ctx.data.projects(),
      ctx.data.routines(),
      ctx.data.profile(),
      ctx.data.timer(),
      ctx.data.ledger({ from: month, to: monthLast }),
      ctx.data.ledger({ statuses: ["pending"], kinds: ["income"] }),
    ])

    const plannedTasks = values(plannedRecords)
    const dayEntries = values(entryRecords)
    const timerValue = timer.value
    const taskIds = [...new Set([
      ...dayEntries.flatMap((entry) => entry.taskId === null ? [] : [entry.taskId]),
      ...(timerValue?.taskId ? [timerValue.taskId] : []),
    ])]
    const knownIds = new Set(plannedTasks.map((task) => task.id))
    const missingTaskIds = taskIds.filter((id) => !knownIds.has(id))
    const linkedTasks = missingTaskIds.length > 0 ? values(await ctx.data.tasks({ ids: missingTaskIds })) : []
    const tasksById = taskMap([...plannedTasks, ...linkedTasks])
    const projectsById = new Map(projectRecords.map(({ value }) => [value.id, value]))
    const allRoutines = values(routineRecords)
    const dueRoutines = allRoutines.filter((routine) => isDueOn(routine, date)).sort((a, b) => {
      const rank = (cadence: typeof a.cadence) => cadence === "daily" || cadence === "weekdays" ? 0 : 1
      return rank(a.cadence) - rank(b.cadence) || Number(isDone(a, date)) - Number(isDone(b, date))
    })
    const routineMin = routineMinutesOn(allRoutines, date)
    const wall = toWallWorkbench({
      profile: profile.value ?? undefined,
      tasks: plannedTasks,
      routines: allRoutines,
      entries: dayEntries,
    }, ctx.clock)
    const load = dayLoad(wall.tasks, date, wall.profile, routineMin)
    const pendingValues = values(pendingLedger)
    const pendingOverdue = overduePending(pendingValues, ctx.clock.today)
    const overdueTasks = new Map<string, Task>()
    for (const task of values(overdueDueRecords)) {
      if (isOpen(task) && isOverdue(task, date)) overdueTasks.set(task.id, task)
    }
    for (const task of values(slippedRecords)) {
      if (isSlipped(task, date)) overdueTasks.set(task.id, task)
    }
    const overdueList = sortTasks([...overdueTasks.values()], "priority")
    const dueSoonList = sortTasks(
      values(dueSoonRecords).filter((task) => task.dueOn !== null && task.dueOn >= date && task.dueOn <= addDays(date, 3)),
      "due"
    )
    const overdueTruncated = overdueList.length > 20
    const dueSoonTruncated = values(dueSoonRecords).length > 10 || dueSoonList.length > 10
    const present = presentationContext(ctx, projectRecords)
    const monthTotals = totals(values(monthLedger), month, monthLast)
    const trackedMin = dayEntries.reduce((sum, entry) => sum + minutesOf(entry), 0)

    return {
      date,
      today: date === ctx.clock.today,
      timeZone: ctx.clock.timeZone,
      timeZoneKnown: ctx.clock.timeZoneKnown,
      currency: profileCurrency(profile.value ?? {}),
      weekday: weekdayOf(date),
      capacity: {
        capacityMin: load.capacity,
        plannedMin: load.planned,
        routineMin,
        overbooked: load.planned > load.capacity,
      },
      timeline: plannedTasks.filter((task) => task.status !== "dropped" && task.startAt !== null)
        .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""))
        .map((task) => presentTask(task, present)),
      planned: plannedTasks.filter((task) => task.status !== "dropped" && task.startAt === null)
        .sort(scheduleOrder)
        .map((task) => presentTask(task, present)),
      overdue: overdueList.slice(0, 20).map((task) => presentTask(task, present)),
      dueSoon: dueSoonList.slice(0, 10).map((task) => presentTask(task, present)),
      routines: dueRoutines.map((routine) => ({
        id: routine.id,
        title: routine.title,
        due: true,
        done: isDone(routine, date),
        streak: streak(routine, date),
      })),
      tracked: {
        totalMin: trackedMin,
        entries: dayEntries.map((entry) => presentEntry(entry, present, tasksById)),
      },
      timer: timerValue === null ? null : {
        label: timerValue.label,
        task: timerValue.taskId === null ? null : tasksById.has(timerValue.taskId)
          ? presentTask(tasksById.get(timerValue.taskId)!, present)
          : { id: timerValue.taskId },
        project: timerValue.projectId === null ? null : {
          id: timerValue.projectId,
          name: projectsById.get(timerValue.projectId)?.name ?? "(deleted project)",
        },
        startedAt: ctx.clock.formatLocal(timerValue.startedAt),
        runningMin: Math.max(0, Math.floor((ctx.clock.now - timerValue.startedAt) / 60_000)),
      },
      money: {
        income: roundMoney(monthTotals.income),
        expense: roundMoney(monthTotals.expense),
        net: roundMoney(monthTotals.net),
        pendingCount: pendingValues.length,
        overduePending: pendingOverdue.slice(0, 20).map((entry) => presentLedger(entry, present)),
        overduePendingTruncated: pendingOverdue.length > 20,
      },
      truncated: overdueTruncated || dueSoonTruncated || pendingOverdue.length > 20,
      truncatedByKind: { overdue: overdueTruncated, dueSoon: dueSoonTruncated, overduePending: pendingOverdue.length > 20 },
    }
  },
}
