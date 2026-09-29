import {
  addDays,
  addMonths,
  dayKeyOf,
  formatDayShort,
  formatMonthDay,
  formatMonthLabel,
  monthEnd,
  monthStart,
  weekStart,
} from "./calendar"
import { totals } from "./ledger"
import { minutesOf } from "./tasks"
import type { DayKey, Task, TimeEntry, WorkbenchData } from "./types"

/** 概览指标：净收入、投入时间、时薪、完成任务，全部从同一份记录现算 */

export type InsightRange = "4w" | "12w" | "12m"
export type InsightMetric = "net" | "hours" | "rate" | "done"

export interface Period {
  start: DayKey
  end: DayKey
}

export interface InsightBucket extends Period {
  label: string
  title: string
}

export function buildBuckets(range: InsightRange, today: DayKey): InsightBucket[] {
  if (range === "12m") {
    return Array.from({ length: 12 }, (_, i) => {
      const start = addMonths(today, i - 11)
      const end = monthEnd(start) < today ? monthEnd(start) : today
      return { start: monthStart(start), end, label: formatMonthLabel(start), title: formatMonthLabel(start, true) }
    })
  }
  const weeks = range === "4w" ? 4 : 12
  const current = weekStart(today)
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(current, (i - weeks + 1) * 7)
    const last = addDays(start, 6)
    const end = last < today ? last : today
    return { start, end, label: formatDayShort(start), title: `${formatMonthDay(start)} – ${formatMonthDay(last)}` }
  })
}

export function rangePeriods(range: InsightRange, today: DayKey): { current: Period; previous: Period } {
  const buckets = buildBuckets(range, today)
  const current = { start: buckets[0].start, end: today }
  if (range === "12m") {
    return { current, previous: { start: addMonths(current.start, -12), end: addDays(current.start, -1) } }
  }
  const days = buckets.length * 7
  return { current, previous: { start: addDays(current.start, -days), end: addDays(current.start, -1) } }
}

function entryDay(entry: TimeEntry): DayKey {
  return dayKeyOf(new Date(entry.start))
}

export function minutesIn(entries: TimeEntry[], period: Period, projectId?: string | null): number {
  let sum = 0
  for (const entry of entries) {
    const day = entryDay(entry)
    if (day < period.start || day > period.end) continue
    if (projectId !== undefined && entry.projectId !== projectId) continue
    sum += minutesOf(entry)
  }
  return sum
}

export function doneIn(tasks: Task[], period: Period, projectId?: string | null): Task[] {
  return tasks.filter((task) => {
    if (task.status !== "done" || task.completedAt === null) return false
    const day = dayKeyOf(new Date(task.completedAt))
    if (day < period.start || day > period.end) return false
    return projectId === undefined || task.projectId === projectId
  })
}

/** 每小时净赚多少；没有投入时间时为 0 */
export function hourlyRate(net: number, minutes: number): number {
  return minutes > 0 ? net / (minutes / 60) : 0
}

function measure(metric: InsightMetric, data: WorkbenchData, period: Period): number {
  switch (metric) {
    case "net":
      return totals(data.ledger, period.start, period.end).net
    case "hours":
      return minutesIn(data.entries, period)
    case "rate":
      return hourlyRate(totals(data.ledger, period.start, period.end).net, minutesIn(data.entries, period))
    case "done":
      return doneIn(data.tasks, period).length
  }
}

export interface InsightSeriesPoint {
  label: string
  title: string
  value: number
  compare: number | null
}

export interface InsightResult {
  metric: InsightMetric
  value: number
  previous: number
  change: number | null
  series: InsightSeriesPoint[]
}

export function computeInsight(metric: InsightMetric, data: WorkbenchData, range: InsightRange, today: DayKey): InsightResult {
  const { current, previous } = rangePeriods(range, today)
  const value = measure(metric, data, current)
  const before = measure(metric, data, previous)
  const shift = (day: DayKey) => (range === "12m" ? addMonths(day, -12) : addDays(day, -(range === "4w" ? 28 : 84)))
  return {
    metric,
    value,
    previous: before,
    change: before === 0 ? null : (value - before) / Math.abs(before),
    series: buildBuckets(range, today).map((bucket) => ({
      label: bucket.label,
      title: bucket.title,
      value: measure(metric, data, bucket),
      compare: measure(metric, data, { start: shift(bucket.start), end: shift(bucket.end) }),
    })),
  }
}

export interface ProjectStat {
  projectId: string | null
  income: number
  expense: number
  net: number
  minutes: number
  rate: number
  done: number
}

/** 每个副业在这段时间里的收支、投入和时薪 */
export function projectStats(data: WorkbenchData, period: Period): ProjectStat[] {
  const ids = new Set<string | null>([...data.projects.map((project) => project.id), null])
  return [...ids]
    .map((projectId) => {
      const money = totals(data.ledger, period.start, period.end, projectId)
      const minutes = minutesIn(data.entries, period, projectId)
      return {
        projectId,
        ...money,
        minutes,
        rate: hourlyRate(money.net, minutes),
        done: doneIn(data.tasks, period, projectId).length,
      }
    })
    .filter((stat) => stat.income > 0 || stat.expense > 0 || stat.minutes > 0)
}

/** 估时准不准：完成的任务里，实际用时 ÷ 预估用时 */
export function estimateAccuracy(tasks: Task[], entries: TimeEntry[], period: Period) {
  const done = doneIn(tasks, period).filter((task) => task.estimateMin > 0)
  const ids = new Set(done.map((task) => task.id))
  let actual = 0
  for (const entry of entries) if (entry.taskId && ids.has(entry.taskId)) actual += minutesOf(entry)
  const estimate = done.reduce((sum, task) => sum + task.estimateMin, 0)
  return { estimate, actual, ratio: estimate > 0 ? actual / estimate : null }
}

/** 一周七天（周一到周日）各投入了多少分钟，看哪几天最常做副业 */
export function minutesByWeekday(entries: TimeEntry[], period: Period): number[] {
  const result = [0, 0, 0, 0, 0, 0, 0]
  for (const entry of entries) {
    const date = new Date(entry.start)
    const day = dayKeyOf(date)
    if (day < period.start || day > period.end) continue
    result[(date.getDay() + 6) % 7] += minutesOf(entry)
  }
  return result
}
