"use client"

import { cn } from "cn"
import { Plus, Repeat, Timer, Wallet } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { BoardColumn, Surface } from "@/components/base/board"
import { IconButton } from "@/components/base/icon-button"
import { AiMark } from "@/features/ai/ai-mark"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { CADENCE, ENTRY_STATUS } from "@/data/catalog"
import { dayKeyOf, minuteOfDay, minutesToTime, monthEnd, monthStart } from "@/domain/calendar"
import { formatAmount, formatClock, formatMinutes, formatSignedAmount } from "@/domain/format"
import { pendingIncome, totals } from "@/domain/ledger"
import { isDone, isDueOn, streak } from "@/domain/routines"
import { minutesOf } from "@/domain/tasks"
import type { DayKey, Routine } from "@/domain/types"
import { useT } from "@/i18n/react"
import { focusRingInset } from "@/lib/styles"
import { useNow, useProjectsById } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"

/** 例行的连续计数单位：按周计的用周，按月计的用个月 */
function streakUnit(t: ReturnType<typeof useT>, cadence: Routine["cadence"]): string {
  return t.today.streakUnit[cadence]
}

/** 例行：今天该做的勾一下；每周、每月的在本期内任意一天做都算 */
export function RoutinesCard({ today }: { today: DayKey }) {
  const routines = useWorkbench((state) => state.routines)
  const toggleRoutine = useWorkbench((state) => state.toggleRoutine)
  const openRoutineForm = useUi((state) => state.openRoutineForm)
  const projectsById = useProjectsById()
  const t = useT()

  const due = useMemo(() => {
    const rank = (routine: Routine) => (routine.cadence === "daily" || routine.cadence === "weekdays" ? 0 : 1)
    return routines
      .filter((routine) => isDueOn(routine, today))
      .sort((a, b) => rank(a) - rank(b) || Number(isDone(a, today)) - Number(isDone(b, today)))
  }, [routines, today])
  const doneCount = due.filter((routine) => isDone(routine, today)).length

  return (
    <BoardColumn
      icon={<Repeat className="size-4 text-fg-2" aria-hidden />}
      title={t.today.routines.title}
      count={due.length > 0 ? `${doneCount}/${due.length}` : undefined}
      actions={
        <IconButton label={t.today.routines.new} size="icon-xs" onClick={() => openRoutineForm(null)}>
          <Plus />
        </IconButton>
      }
    >
      <Surface className="overflow-hidden">
        {due.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-fg-2">{t.today.routines.empty}</p>
        ) : (
          <ul className="py-1">
            {due.map((routine) => {
              const done = isDone(routine, today)
              const days = streak(routine, today)
              const project = projectsById.get(routine.projectId ?? "")
              const periodic = routine.cadence === "weekly" || routine.cadence === "monthly"
              return (
                <li key={routine.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => toggleRoutine(routine.id, today)}
                    className={cn("flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-sm hover:bg-hover", focusRingInset)}
                  >
                    <StatusIcon glyph={done ? "check" : "ring"} tone={done ? "done" : "neutral"} />
                    <span className={cn("min-w-0 flex-1 truncate", done && "text-fg-2")}>{routine.title}</span>
                    {periodic && <span className="shrink-0 text-xs text-fg-2">{CADENCE[routine.cadence].period}</span>}
                    {project && <ProjectMark name={project.name} color={project.color} size={14} />}
                    <span className="min-w-10 shrink-0 text-right text-xs whitespace-nowrap text-fg-2 tabular">
                      {days > 0 ? t.today.routines.streak(days, streakUnit(t, routine.cadence)) : "—"}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Surface>
    </BoardColumn>
  )
}

/** 收支：今天记的账，本月净收入对照各副业的月目标，还有多少钱在路上 */
export function MoneyCard({ today }: { today: DayKey }) {
  const ledger = useWorkbench((state) => state.ledger)
  const projects = useWorkbench((state) => state.projects)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const t = useT()

  const todays = useMemo(
    () => ledger.filter((entry) => entry.date === today).sort((a, b) => b.createdAt - a.createdAt),
    [ledger, today]
  )
  const month = useMemo(() => totals(ledger, monthStart(today), monthEnd(today)), [ledger, today])
  const pending = useMemo(() => pendingIncome(ledger), [ledger])
  const pendingSum = pending.reduce((sum, entry) => sum + entry.amount, 0)
  const target = projects
    .filter((project) => project.stage !== "ended" && project.stage !== "paused")
    .reduce((sum, project) => sum + (project.monthlyTarget ?? 0), 0)
  const progress = target > 0 ? Math.max(0, Math.min(1, month.net / target)) : 0

  return (
    <BoardColumn
      icon={<Wallet className="size-4 text-fg-2" aria-hidden />}
      title={t.today.money.title}
      actions={
        <IconButton label={t.today.page.addEntry} shortcut="M" size="icon-xs" onClick={() => openEntryForm({ mode: "create" })}>
          <Plus />
        </IconButton>
      }
    >
      <Surface className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-fg-2">{t.today.money.netThisMonth}</span>
          <span className={cn("text-sm font-medium tabular", month.net < 0 && "text-bad")}>{formatAmount(month.net)}</span>
        </div>
        {target > 0 && (
          <div className="flex items-center gap-2">
            <div
              role="meter"
              aria-label={t.today.money.meterAria}
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={Math.max(0, month.net)}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-pressed/70"
            >
              <span className="block h-full rounded-full bg-ink" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="shrink-0 text-xs text-fg-2 tabular">{t.today.money.target(formatAmount(target))}</span>
          </div>
        )}
        {pending.length > 0 && (
          <Link
            href="/ledger?status=pending"
            className={cn("-mx-1 flex items-center gap-2 rounded-sm px-1 text-xs text-fg-2 hover:text-fg", focusRingInset)}
          >
            <StatusIcon glyph={ENTRY_STATUS.pending.glyph} tone={ENTRY_STATUS.pending.tone} />
            {t.today.money.pending(pending.length)}
            <span className="ml-auto tabular">{formatAmount(pendingSum)}</span>
          </Link>
        )}
      </Surface>
      {todays.length > 0 && (
        <Surface className="overflow-hidden">
          <ul>
            {todays.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => openEntryForm({ mode: "edit", entryId: entry.id })}
                  className={cn("flex h-8 w-full min-w-0 items-center gap-2 border-b border-line px-3 text-left text-sm last:border-b-0 hover:bg-hover", focusRingInset)}
                >
                  <StatusIcon glyph={ENTRY_STATUS[entry.status].glyph} tone={ENTRY_STATUS[entry.status].tone} label={ENTRY_STATUS[entry.status].label} />
                  <span className="min-w-0 flex-1 truncate">{entry.note}</span>
                  <span className={cn("shrink-0 tabular", entry.kind === "income" ? "text-fg" : "text-fg-2")}>
                    {formatSignedAmount(entry.kind === "income" ? entry.amount : -entry.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </BoardColumn>
  )
}

/** 投入：今天每段计时的记录，正在计时的一段排最上面 */
export function FocusCard({ today }: { today: DayKey }) {
  const entries = useWorkbench((state) => state.entries)
  const tasks = useWorkbench((state) => state.tasks)
  const timer = useWorkbench((state) => state.timer)
  const openTask = useUi((state) => state.openTask)
  const projectsById = useProjectsById()
  const now = useNow(timer ? 1000 : 60_000)
  const t = useT()

  const titles = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks])
  const todays = useMemo(
    () => entries.filter((entry) => dayKeyOf(new Date(entry.start)) === today).sort((a, b) => b.start - a.start),
    [entries, today]
  )
  const total = todays.reduce((sum, entry) => sum + minutesOf(entry), 0) + (timer ? Math.floor((now - timer.startedAt) / 60_000) : 0)

  return (
    <BoardColumn icon={<Timer className="size-4 text-fg-2" aria-hidden />} title={t.today.focus.title} meta={total > 0 ? formatMinutes(total) : undefined}>
      <Surface className="overflow-hidden">
        {todays.length === 0 && !timer ? (
          <p className="px-3 py-2.5 text-sm text-fg-2">{t.today.focus.empty}</p>
        ) : (
          <ul>
            {timer && (
              <li className="flex h-8 min-w-0 items-center gap-2 border-b border-line bg-progress/[0.07] px-3 text-sm">
                <span className="w-[4.75rem] shrink-0 text-xs text-warn tabular">{t.common.taskSheet.startedAt(minutesToTime(minuteOfDay(timer.startedAt)))}</span>
                <span className="min-w-0 flex-1 truncate">{timer.label}</span>
                <span className="shrink-0 text-xs text-warn tabular">{formatClock(now - timer.startedAt)}</span>
              </li>
            )}
            {todays.map((entry) => {
              const project = projectsById.get(entry.projectId ?? "")
              const title = entry.taskId ? titles.get(entry.taskId) : undefined
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    disabled={!entry.taskId}
                    onClick={() => entry.taskId && openTask(entry.taskId)}
                    className={cn("flex h-8 w-full min-w-0 items-center gap-2 border-b border-line px-3 text-left text-sm last:border-b-0 enabled:hover:bg-hover", focusRingInset)}
                  >
                    <span className="w-[4.75rem] shrink-0 text-xs text-fg-2 tabular">
                      {minutesToTime(minuteOfDay(entry.start))}–{minutesToTime(minuteOfDay(entry.end))}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-1">
                      <AiMark origin={entry.origin} />
                      <span className="min-w-0 truncate">{title ?? project?.name ?? t.common.personal}</span>
                    </span>
                    {project && <ProjectMark name={project.name} color={project.color} size={14} />}
                    <span className="w-10 shrink-0 text-right text-xs text-fg-2 tabular">{formatMinutes(minutesOf(entry))}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Surface>
    </BoardColumn>
  )
}
