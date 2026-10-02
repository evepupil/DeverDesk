import { addDays, monthEnd, monthStart, weekStart } from "../../../../src/domain/calendar"
import { hourlyRate } from "../../../../src/domain/insights"
import { minutesOf, isOpen, sortTasks } from "../../../../src/domain/tasks"
import type { DayKey, LedgerEntry, Milestone, Project, Task, TimeEntry } from "../../../../src/domain/types"
import { PROJECT_WEEKS } from "../../../../src/domain/projects"
import type { ProjectSummary } from "../../../../src/domain/projects"
import { roundMoney } from "../shared/numbers"
import { PROJECT_REF } from "../shared/schema"
import { resolveProject } from "../shared/refs"
import { presentLedger, presentProject, presentTask, presentationContext, values } from "./common"
import { ToolInputError } from "../../types"
import type { Clock, ReadTool } from "../../types"

interface GetProjectInput {
  project: string | null
}

/** 里程碑清单最多返回多少个：正常用不到，只是防止输出过大 */
const MILESTONE_LIMIT = 50

/** 全部里程碑：没完成的在前、按截止日排，已完成的在后。AI 要标完成时按这里的编号或标题指定 */
function listMilestones(project: Project): Milestone[] {
  const byDue = (a: Milestone, b: Milestone) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title)
  const pending = project.milestones.filter((milestone) => milestone.doneOn === null).sort(byDue)
  const finished = project.milestones.filter((milestone) => milestone.doneOn !== null).sort(byDue)
  return [...pending, ...finished].map(({ id, title, due, doneOn }) => ({ id, title, due, doneOn }))
}

function summarizeProjectOnce(
  data: { tasks: Task[]; ledger: LedgerEntry[]; entries: TimeEntry[] },
  project: Project,
  today: DayKey,
  clock: Clock,
): ProjectSummary {
  const monthStartDay = monthStart(today)
  const monthEndDay = monthEnd(today)
  const currentWeek = weekStart(today)
  const oldestWeek = addDays(currentWeek, (1 - PROJECT_WEEKS) * 7)
  const nextWeek = addDays(currentWeek, 7)
  const weeks = Array.from({ length: PROJECT_WEEKS }, (_, index) => ({
    start: addDays(oldestWeek, index * 7),
    net: 0,
    minutes: 0,
  }))
  const weeksByStart = new Map(weeks.map((week) => [week.start, week]))
  const weekMoney = new Map(weeks.map((week) => [week.start, { income: 0, expense: 0 }]))
  let income = 0
  let expense = 0
  let totalIncome = 0
  let totalExpense = 0
  let monthMinutes = 0
  let totalMinutes = 0
  let lastActive: DayKey | null = null

  for (const entry of data.ledger) {
    if (entry.projectId !== project.id) continue
    if (!lastActive || entry.date > lastActive) lastActive = entry.date
    if (entry.status !== "received") continue
    if (entry.kind === "income") totalIncome += entry.amount
    else totalExpense += entry.amount
    if (entry.date >= monthStartDay && entry.date <= monthEndDay) {
      if (entry.kind === "income") income += entry.amount
      else expense += entry.amount
    }
    const weekMoneyTotals = weekMoney.get(weekStart(entry.date))
    if (weekMoneyTotals !== undefined) {
      if (entry.kind === "income") weekMoneyTotals.income += entry.amount
      else weekMoneyTotals.expense += entry.amount
    }
  }

  const relevantFrom = Math.min(clock.startOfDay(oldestWeek), clock.startOfDay(monthStartDay))
  const relevantTo = Math.max(clock.startOfDay(nextWeek), clock.startOfDay(addDays(monthEndDay, 1)))
  let latestEntryStart: number | null = null
  for (const entry of data.entries) {
    if (entry.projectId !== project.id) continue
    const minutes = minutesOf(entry)
    totalMinutes += minutes
    if (latestEntryStart === null || entry.start > latestEntryStart) latestEntryStart = entry.start
    if (entry.start < relevantFrom || entry.start >= relevantTo) continue
    const day = clock.dayOf(entry.start)
    if (day >= monthStartDay && day <= monthEndDay) monthMinutes += minutes
    const week = weeksByStart.get(weekStart(day))
    if (week !== undefined) week.minutes += minutes
  }
  if (latestEntryStart !== null) {
    const day = clock.dayOf(latestEntryStart)
    if (!lastActive || day > lastActive) lastActive = day
  }

  let openTasks = 0
  let doingTasks = 0
  for (const task of data.tasks) {
    if (task.projectId !== project.id) continue
    if (isOpen(task)) openTasks += 1
    if (task.status === "doing") doingTasks += 1
  }

  for (const week of weeks) {
    const money = weekMoney.get(week.start)
    if (money !== undefined) week.net = money.income - money.expense
  }

  const pending = project.milestones.filter((milestone) => !milestone.doneOn).sort((a, b) => a.due.localeCompare(b.due))
  const net = income - expense
  return {
    project,
    month: { income, expense, net, minutes: monthMinutes, rate: hourlyRate(net, monthMinutes) },
    totalNet: totalIncome - totalExpense,
    totalMinutes,
    openTasks,
    doingTasks,
    nextMilestone: pending[0] ?? null,
    milestonesDone: project.milestones.length - pending.length,
    weeks,
    lastActive,
  }
}

export const getProjectTool: ReadTool<GetProjectInput> = {
  kind: "read",
  name: "get_project",
  title: "Get project",
  description: "Read a side project's profile, financial and time metrics, milestones, recent trend, and related tasks and ledger entries. Use it when the user asks for a project's full status.",
  inputSchema: {
    type: "object",
    properties: { project: PROJECT_REF },
    required: ["project"],
    additionalProperties: false,
  },
  async run(ctx, input) {
    if (input.project === null) throw new ToolInputError("A project reference is required.")
    const projects = await ctx.data.projects()
    const selected = resolveProject(input.project, projects)
    if (selected === null || selected === undefined) throw new ToolInputError("Project reference could not be resolved.")
    const project = selected.value
    const [taskRecords, ledgerRecords, entryRecords] = await Promise.all([
      ctx.data.tasks({ projectId: project.id }),
      ctx.data.ledger({ projectId: project.id }),
      ctx.data.entries({ projectId: project.id }),
    ])
    const tasks = values(taskRecords)
    const ledger = values(ledgerRecords)
    const entries = values(entryRecords)
    const summary = summarizeProjectOnce({ tasks, ledger, entries }, project, ctx.clock.today, ctx.clock)
    const open = sortTasks(tasks.filter(isOpen), "priority")
    const completed = tasks.filter((task) => task.status === "done" && task.completedAt !== null)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    const recentLedger = [...ledger].sort((a, b) => b.date.localeCompare(a.date))
    const present = presentationContext(ctx, projects)
    const milestones = listMilestones(project)

    return {
      project: presentProject(project),
      month: {
        income: roundMoney(summary.month.income),
        expense: roundMoney(summary.month.expense),
        net: roundMoney(summary.month.net),
        minutes: summary.month.minutes,
        hourlyRate: roundMoney(summary.month.rate),
      },
      totalNet: roundMoney(summary.totalNet),
      totalMinutes: summary.totalMinutes,
      monthlyTargetProgressPercent: project.monthlyTarget === null || project.monthlyTarget === 0
        ? null
        : Math.round((Math.max(0, summary.month.net) / project.monthlyTarget) * 100),
      milestones: {
        done: summary.milestonesDone,
        total: project.milestones.length,
        next: summary.nextMilestone,
        items: milestones.slice(0, MILESTONE_LIMIT),
        itemsTruncated: milestones.length > MILESTONE_LIMIT,
      },
      weeks: summary.weeks.map((week) => ({ ...week, net: roundMoney(week.net) })),
      lastActive: summary.lastActive,
      openTasks: open.length,
      openTaskItems: open.slice(0, 30).map((task) => presentTask(task, present)),
      openTasksTruncated: open.length > 30,
      recentCompleted: completed.slice(0, 10).map((task) => presentTask(task, present)),
      recentCompletedTruncated: completed.length > 10,
      recentLedger: recentLedger.slice(0, 10).map((entry) => presentLedger(entry, present)),
      recentLedgerTruncated: recentLedger.length > 10,
      truncated: open.length > 30 || completed.length > 10 || recentLedger.length > 10 || milestones.length > MILESTONE_LIMIT,
    }
  },
}
