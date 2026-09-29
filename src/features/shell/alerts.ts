import type { StatusMeta } from "@/data/catalog"
import { diffDays, formatMonthDay } from "@/domain/calendar"
import { formatAmount, formatMinutes } from "@/domain/format"
import { overduePending } from "@/domain/ledger"
import { dayLoad } from "@/domain/planning"
import { routineMinutesOn } from "@/domain/routines"
import { isOverdue, isSlipped } from "@/domain/tasks"
import type { DayKey, WorkbenchData } from "@/domain/types"

/** 点提醒之后去哪：打开任务、打开那笔收支，或者跳到某个页面 */
export type AlertTarget =
  | { kind: "task"; taskId: string }
  | { kind: "entry"; entryId: string }
  | { kind: "href"; href: string }

export interface WorkbenchAlert {
  id: string
  status: StatusMeta
  title: string
  detail: string
  target: AlertTarget
}

const OVERDUE: StatusMeta = { label: "逾期", glyph: "alert", tone: "risk" }
const SLIPPED: StatusMeta = { label: "延期", glyph: "half", tone: "progress" }
const PENDING: StatusMeta = { label: "待到账", glyph: "half", tone: "progress" }
const FULL: StatusMeta = { label: "排满", glyph: "alert", tone: "progress" }

/**
 * 提醒都从数据现算：今天排超了、过了截止日、没按计划做完、钱过了约定日还没到。
 * 编号里带上日期，第二天同样的情况会重新提醒。
 */
export function deriveWorkbenchAlerts(data: WorkbenchData, today: DayKey): WorkbenchAlert[] {
  const alerts: WorkbenchAlert[] = []

  const load = dayLoad(data.tasks, today, data.profile, routineMinutesOn(data.routines, today))
  if (load.planned > load.capacity) {
    alerts.push({
      id: `capacity:${today}`,
      status: FULL,
      title: "今天排的比能用的时间多",
      detail: `已排 ${formatMinutes(load.planned)}，可用 ${formatMinutes(load.capacity)}`,
      target: { kind: "href", href: "/" },
    })
  }

  const overdue = data.tasks
    .filter((task) => isOverdue(task, today))
    .sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""))
  for (const task of overdue) {
    const due = task.dueOn ?? today
    alerts.push({
      id: `overdue:${task.id}:${due}`,
      status: OVERDUE,
      title: task.title,
      detail: `逾期 ${diffDays(today, due)} 天 · ${formatMonthDay(due)}截止`,
      target: { kind: "task", taskId: task.id },
    })
  }

  const slipped = data.tasks.filter((task) => isSlipped(task, today) && !isOverdue(task, today))
  if (slipped.length > 0) {
    alerts.push({
      id: `slipped:${today}:${slipped.length}`,
      status: SLIPPED,
      title: `${slipped.length} 件任务没按计划做完`,
      detail: "挪到今天，或者重新安排日子",
      target: { kind: "href", href: "/tasks?plan=overdue" },
    })
  }

  for (const entry of overduePending(data.ledger, today)) {
    const expected = entry.expectedOn ?? entry.date
    alerts.push({
      id: `pending:${entry.id}:${expected}`,
      status: PENDING,
      title: `${formatAmount(entry.amount)} 还没到账`,
      detail: `${entry.note} · 约定 ${formatMonthDay(expected)}`,
      target: { kind: "entry", entryId: entry.id },
    })
  }

  return alerts
}
