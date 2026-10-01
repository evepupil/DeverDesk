import { addDays, monthStart, weekStart } from "../../../../src/domain/calendar"
import { hourlyRate } from "../../../../src/domain/insights"
import { minutesOf } from "../../../../src/domain/tasks"
import type { DayKey, LedgerEntry, Task } from "../../../../src/domain/types"
import { assertDay, assertRange } from "../shared/dates"
import { resolveProject } from "../shared/refs"
import { DAY, PROJECT_REF } from "../shared/schema"
import { projectRef } from "../shared/present"
import { localDayBounds, presentationContext, sumEntryMinutesByTask, values } from "./common"
import { ToolInputError, type ReadTool, type TaskQuery, type ToolContext } from "../../types"

const RANGES = ["week", "month", "quarter", "year"] as const
type StatsRange = (typeof RANGES)[number]

interface GetStatsInput {
  range?: StatsRange
  start?: string
  end?: string
  project?: string | null
}

function quarterStart(day: DayKey): DayKey {
  const year = day.slice(0, 4)
  const month = Math.floor((Number(day.slice(5, 7)) - 1) / 3) * 3 + 1
  return `${year}-${String(month).padStart(2, "0")}-01`
}

function currentRange(range: StatsRange, today: DayKey): { start: DayKey; end: DayKey } {
  switch (range) {
    case "week": return { start: weekStart(today), end: today }
    case "month": return { start: monthStart(today), end: today }
    case "quarter": return { start: quarterStart(today), end: today }
    case "year": return { start: `${today.slice(0, 4)}-01-01`, end: today }
  }
}

interface StatsTotals {
  income: number
  expense: number
  minutes: number
  tasksDone: number
}

function blankStats(): StatsTotals {
  return { income: 0, expense: 0, minutes: 0, tasksDone: 0 }
}

function addLedger(totals: StatsTotals, entry: LedgerEntry): void {
  if (entry.status !== "received") return
  if (entry.kind === "income") totals.income += entry.amount
  else totals.expense += entry.amount
}

function addTask(totals: StatsTotals): void {
  totals.tasksDone += 1
}

function taskDateQuery(period: { start: DayKey; end: DayKey }, ctx: ToolContext, projectId: string | null | undefined): TaskQuery {
  const bounds = localDayBounds(ctx.clock, period.start, period.end)
  return {
    statuses: ["done"],
    completedFrom: bounds.from,
    completedTo: bounds.to,
    ...(projectId === undefined ? {} : { projectId }),
  }
}

export const getStatsTool: ReadTool<GetStatsInput> = {
  kind: "read",
  name: "get_stats",
  title: "Get stats",
  description: "Compare income, expenses, tracked time, completed tasks, and estimates across two periods. Use it for a calendar range or a custom date span, optionally limited to one project.",
  inputSchema: {
    type: "object",
    properties: {
      range: { type: "string", enum: RANGES, default: "month", description: "Calendar period through today: week, month, quarter, or year." },
      start: DAY,
      end: DAY,
      project: PROJECT_REF,
    },
    additionalProperties: false,
  },
  async run(ctx, input) {
    const hasStart = input.start !== undefined
    const hasEnd = input.end !== undefined
    if (hasStart !== hasEnd) throw new ToolInputError("Provide both \"start\" and \"end\" for a custom date range.")
    if (hasStart && input.range !== undefined) throw new ToolInputError("Use either \"range\" or \"start\" and \"end\", not both.")
    let current: { start: DayKey; end: DayKey }
    if (hasStart && hasEnd) {
      current = { start: assertDay(input.start!, "start"), end: assertDay(input.end!, "end") }
      assertRange(current.start, current.end, 365, "stats")
    } else {
      current = currentRange(input.range ?? "month", ctx.clock.today)
    }
    const days = Math.round((Date.parse(`${current.end}T00:00:00Z`) - Date.parse(`${current.start}T00:00:00Z`)) / 86_400_000) + 1
    const previous = { start: addDays(current.start, -days), end: addDays(current.start, -1) }
    const projectsPromise = ctx.data.projects()
    const initialProjects = input.project === undefined ? undefined : await projectsPromise
    const selected = input.project === undefined ? undefined : resolveProject(input.project, initialProjects ?? [])
    const projectId = selected === undefined ? undefined : selected === null ? null : selected.value.id
    const currentBounds = localDayBounds(ctx.clock, current.start, current.end)
    const previousBounds = localDayBounds(ctx.clock, previous.start, previous.end)
    const currentTaskQuery = taskDateQuery(current, ctx, projectId)
    const previousTaskQuery = taskDateQuery(previous, ctx, projectId)
    const [projectRecords, currentTasksResult, previousTasksResult, currentLedgerResult, previousLedgerResult, currentEntriesResult, previousEntriesResult] = await Promise.all([
      initialProjects ?? projectsPromise,
      ctx.data.tasks(currentTaskQuery),
      ctx.data.tasks(previousTaskQuery),
      ctx.data.ledger({ from: current.start, to: current.end, ...(projectId === undefined ? {} : { projectId }) }),
      ctx.data.ledger({ from: previous.start, to: previous.end, ...(projectId === undefined ? {} : { projectId }) }),
      ctx.data.entries({ from: currentBounds.from, to: currentBounds.to, ...(projectId === undefined ? {} : { projectId }) }),
      ctx.data.entries({ from: previousBounds.from, to: previousBounds.to, ...(projectId === undefined ? {} : { projectId }) }),
    ])
    const currentTasks = values(currentTasksResult)
    const currentEntries = values(currentEntriesResult)
    const currentLedger = values(currentLedgerResult)
    const previousTasks = values(previousTasksResult)
    const previousLedger = values(previousLedgerResult)
    const previousEntries = values(previousEntriesResult)
    const projects = values(projectRecords)
    const projectStatsById = new Map<string | null, StatsTotals>(
      [...new Set<string | null>([...projects.map((project) => project.id), null])].map((id) => [id, blankStats()]),
    )
    const currentMoney = blankStats()
    const previousMoney = blankStats()
    let currentMinutes = 0
    let previousMinutes = 0
    let currentDone = 0
    let previousDone = 0
    const weekdayMinutes = [0, 0, 0, 0, 0, 0, 0]
    const accuracyTasks: Task[] = []

    for (const task of currentTasks) {
      if (task.status !== "done" || task.completedAt === null) continue
      currentDone += 1
      const stats = projectStatsById.get(task.projectId)
      if (stats) addTask(stats)
      if (task.estimateMin > 0) accuracyTasks.push(task)
    }
    for (const task of previousTasks) {
      if (task.status === "done" && task.completedAt !== null) previousDone += 1
    }

    for (const entry of currentLedger) {
      if (projectId === undefined || entry.projectId === projectId) addLedger(currentMoney, entry)
      const stats = projectStatsById.get(entry.projectId)
      if (stats) addLedger(stats, entry)
    }
    for (const entry of previousLedger) {
      if (projectId === undefined || entry.projectId === projectId) addLedger(previousMoney, entry)
    }

    for (const entry of currentEntries) {
      const minutes = minutesOf(entry)
      if (projectId === undefined || entry.projectId === projectId) {
        currentMinutes += minutes
        const weekday = (Math.floor(ctx.clock.toWall(entry.start) / 86_400_000) + 4) % 7
        weekdayMinutes[(weekday + 6) % 7] += minutes
      }
      const stats = projectStatsById.get(entry.projectId)
      if (stats) stats.minutes += minutes
    }
    for (const entry of previousEntries) {
      if (projectId === undefined || entry.projectId === projectId) previousMinutes += minutesOf(entry)
    }

    const estimateTaskIds = [...new Set(accuracyTasks.map((task) => task.id))]
    const estimateMinutesByTask = estimateTaskIds.length > 0
      ? await sumEntryMinutesByTask(ctx.data, estimateTaskIds)
      : new Map<string, number>()
    const estimate = accuracyTasks.reduce((sum, task) => sum + task.estimateMin, 0)
    const actual = accuracyTasks.reduce((sum, task) => sum + (estimateMinutesByTask.get(task.id) ?? 0), 0)
    const accuracy = { estimate, actual, ratio: estimate > 0 ? actual / estimate : null }
    const present = presentationContext(ctx, projectRecords)
    const stats = [...projectStatsById].filter(([, value]) => value.income > 0 || value.expense > 0 || value.minutes > 0)
      .map(([projectIdForStats, value]) => ({
        project: projectRef(projectIdForStats, present),
        income: value.income,
        expense: value.expense,
        net: value.income - value.expense,
        minutes: value.minutes,
        hourlyRate: hourlyRate(value.income - value.expense, value.minutes),
        tasksDone: value.tasksDone,
      }))

    return {
      range: { current, previous },
      ...(selected === undefined ? {} : { project: selected === null ? null : { id: selected.value.id, name: selected.value.name } }),
      current: {
        income: currentMoney.income,
        expense: currentMoney.expense,
        net: currentMoney.income - currentMoney.expense,
        minutes: currentMinutes,
        hourlyRate: hourlyRate(currentMoney.income - currentMoney.expense, currentMinutes),
        tasksDone: currentDone,
      },
      previous: {
        income: previousMoney.income,
        expense: previousMoney.expense,
        net: previousMoney.income - previousMoney.expense,
        minutes: previousMinutes,
        hourlyRate: hourlyRate(previousMoney.income - previousMoney.expense, previousMinutes),
        tasksDone: previousDone,
      },
      byProject: stats,
      estimateAccuracy: accuracy,
      minutesByWeekday: weekdayMinutes,
    }
  },
}
