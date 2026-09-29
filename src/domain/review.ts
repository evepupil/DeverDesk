import { getT } from "../i18n/runtime"
import { addDays, dayKeyOf } from "./calendar"
import { doneIn, estimateAccuracy, minutesIn } from "./insights"
import { totals } from "./ledger"
import { capacityFor, tasksPlannedOn } from "./planning"
import { completionRate } from "./routines"
import { minutesOf } from "./tasks"
import type { DayKey, Project, Task, WorkbenchData } from "./types"

/** 每周回顾：自动汇总这一周做了什么、花在哪、赚了多少 */

export interface WeekReview {
  start: DayKey
  end: DayKey
  done: Task[]
  minutes: number
  minutesByProject: Map<string | null, number>
  days: { day: DayKey; actual: number; planned: number; capacity: number }[]
  income: number
  expense: number
  net: number
  accuracy: { estimate: number; actual: number; ratio: number | null }
  routines: { done: number; due: number }
  previous: { done: number; minutes: number; net: number }
  /** 这周还没过完：例行只算到今天，对比的是上周同期 */
  partial: boolean
}

export function weekReview(data: WorkbenchData, start: DayKey, today?: DayKey): WeekReview {
  const end = addDays(start, 6)
  const period = { start, end }
  const cutoff = today !== undefined && today < end ? today : end
  const previous = { start: addDays(start, -7), end: addDays(cutoff, -7) }

  const minutesByProject = new Map<string | null, number>()
  const actualByDay = new Map<DayKey, number>()
  for (const entry of data.entries) {
    const day = dayKeyOf(new Date(entry.start))
    if (day < start || day > end) continue
    const minutes = minutesOf(entry)
    minutesByProject.set(entry.projectId, (minutesByProject.get(entry.projectId) ?? 0) + minutes)
    actualByDay.set(day, (actualByDay.get(day) ?? 0) + minutes)
  }

  const money = totals(data.ledger, start, end)
  const routineRates = data.routines
    .filter((routine) => !routine.archived)
    .map((routine) => completionRate(routine, start, cutoff))

  return {
    start,
    end,
    done: doneIn(data.tasks, period).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    minutes: minutesIn(data.entries, period),
    minutesByProject,
    days: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i)
      return {
        day,
        actual: actualByDay.get(day) ?? 0,
        planned: tasksPlannedOn(data.tasks, day).reduce((sum, task) => sum + task.estimateMin, 0),
        capacity: capacityFor(day, data.profile),
      }
    }),
    income: money.income,
    expense: money.expense,
    net: money.net,
    accuracy: estimateAccuracy(data.tasks, data.entries, period),
    routines: routineRates.reduce((sum, rate) => ({ done: sum.done + rate.done, due: sum.due + rate.due }), {
      done: 0,
      due: 0,
    }),
    previous: {
      done: doneIn(data.tasks, previous).length,
      minutes: minutesIn(data.entries, previous),
      net: totals(data.ledger, previous.start, previous.end).net,
    },
    partial: cutoff < end,
  }
}

/** 一段话的自动小结：只陈述数据，不做评价 */
export function summarize(
  review: WeekReview,
  projectName: (id: string | null) => string,
  formatMinutes: (minutes: number) => string,
  formatMoney: (value: number) => string
): string[] {
  const t = getT().review.summary
  const lines: string[] = []
  const than = review.partial ? t.thanPartial : t.thanWeek
  const compareTasks = (current: number, before: number) => {
    if (before === 0 && current === 0) return ""
    if (current === before) return t.compare.tasks.same(than)
    const diff = Math.abs(current - before)
    return current > before ? t.compare.tasks.more(diff, than) : t.compare.tasks.less(diff, than)
  }
  const compareMinutes = (current: number, before: number) => {
    if (before === 0 && current === 0) return ""
    if (current === before) return t.compare.minutes.same(than)
    const diff = formatMinutes(Math.abs(current - before))
    return current > before ? t.compare.minutes.more(diff, than) : t.compare.minutes.less(diff, than)
  }
  lines.push(t.done(review.done.length, compareTasks(review.done.length, review.previous.done)))
  if (review.minutes > 0) {
    const top = [...review.minutesByProject.entries()].sort((a, b) => b[1] - a[1])[0]
    const share = top ? Math.round((top[1] / review.minutes) * 100) : 0
    lines.push(
      t.invested(formatMinutes(review.minutes), compareMinutes(review.minutes, review.previous.minutes), top ? t.share(projectName(top[0]), share) : "")
    )
  }
  lines.push(t.net(formatMoney(review.net), formatMoney(review.income), formatMoney(review.expense)))
  if (review.accuracy.ratio !== null) {
    const deviation = Math.round((review.accuracy.ratio - 1) * 100)
    lines.push(t.accuracy(deviation === 0 ? "same" : deviation > 0 ? "over" : "under", Math.abs(deviation)))
  }
  if (review.routines.due > 0) lines.push(t.routines(review.routines.done, review.routines.due))
  return lines
}

export function projectNameOf(projects: Project[]) {
  const map = new Map(projects.map((project) => [project.id, project.name]))
  return (id: string | null) => {
    const t = getT()
    return id ? (map.get(id) ?? t.review.deletedProject) : t.common.personal
  }
}
