import { addDays, dayKeyOf, monthEnd, monthStart, weekStart } from "./calendar"
import { hourlyRate, minutesIn } from "./insights"
import { totals } from "./ledger"
import { isOpen } from "./tasks"
import type { DayKey, Milestone, Project, WorkbenchData } from "./types"

/** 每个副业的进度：这个月赚了多少、花了多少时间、下一个里程碑、最近几周的走势 */

export interface WeekPoint {
  start: DayKey
  net: number
  minutes: number
}

export interface ProjectSummary {
  project: Project
  month: { income: number; expense: number; net: number; minutes: number; rate: number }
  /** 开始以来的净收入 */
  totalNet: number
  totalMinutes: number
  openTasks: number
  doingTasks: number
  nextMilestone: Milestone | null
  milestonesDone: number
  /** 最近 12 周，最早的在前 */
  weeks: WeekPoint[]
  /** 最近一次有投入或收支的日子 */
  lastActive: DayKey | null
}

export const PROJECT_WEEKS = 12

export function summarizeProject(data: WorkbenchData, project: Project, today: DayKey): ProjectSummary {
  const monthPeriod = { start: monthStart(today), end: monthEnd(today) }
  const money = totals(data.ledger, monthPeriod.start, monthPeriod.end, project.id)
  const minutes = minutesIn(data.entries, monthPeriod, project.id)
  const current = weekStart(today)

  const weeks = Array.from({ length: PROJECT_WEEKS }, (_, i) => {
    const start = addDays(current, (i - PROJECT_WEEKS + 1) * 7)
    const end = addDays(start, 6)
    return {
      start,
      net: totals(data.ledger, start, end, project.id).net,
      minutes: minutesIn(data.entries, { start, end }, project.id),
    }
  })

  const tasks = data.tasks.filter((task) => task.projectId === project.id)
  const pending = project.milestones.filter((milestone) => !milestone.doneOn).sort((a, b) => a.due.localeCompare(b.due))

  let lastActive: DayKey | null = null
  for (const entry of data.entries) {
    if (entry.projectId !== project.id) continue
    const day = dayKeyOf(new Date(entry.start))
    if (!lastActive || day > lastActive) lastActive = day
  }
  for (const entry of data.ledger) {
    if (entry.projectId === project.id && (!lastActive || entry.date > lastActive)) lastActive = entry.date
  }

  const all = { start: "0000-01-01", end: "9999-12-31" }
  return {
    project,
    month: { ...money, minutes, rate: hourlyRate(money.net, minutes) },
    totalNet: totals(data.ledger, all.start, all.end, project.id).net,
    totalMinutes: minutesIn(data.entries, all, project.id),
    openTasks: tasks.filter(isOpen).length,
    doingTasks: tasks.filter((task) => task.status === "doing").length,
    nextMilestone: pending[0] ?? null,
    milestonesDone: project.milestones.length - pending.length,
    weeks,
    lastActive,
  }
}
