"use client"

import { cn } from "cn"
import { MoreHorizontal, Pencil, Pause, Play } from "lucide-react"
import { toast } from "sonner"

import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { addDays, addMonths, formatMonthDay, formatMonthLabel } from "@/domain/calendar"
import { formatMinutes } from "@/domain/format"
import { completionRate, heatCells, isDone, isDueOn, streak, type HeatCell } from "@/domain/routines"
import type { DayKey, Routine } from "@/domain/types"
import { useT } from "@/i18n/react"
import { getT } from "@/i18n/runtime"
import { focusRing } from "@/lib/styles"
import { useProjectsById } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"

function cellTone(cell: HeatCell) {
  if (cell.future) return "bg-transparent border border-line"
  if (!cell.due) return "bg-transparent border border-dashed border-line"
  return cell.done ? "bg-done" : "bg-pressed"
}

/** 打卡格子：按天的是 12 周 × 7 天，按周的一排 16 格，按月的一排 12 格；紫色是做了（提炼：紫色已结束） */
function HeatGrid({ routine, today }: { routine: Routine; today: DayKey }) {
  const t = useT()
  const cells = heatCells(routine, today)
  const daily = routine.cadence === "daily" || routine.cadence === "weekdays"
  const title = (cell: HeatCell) => {
    const when =
      routine.cadence === "monthly"
        ? formatMonthLabel(cell.key, true)
        : routine.cadence === "weekly"
          ? t.routines.heat.weekOf(formatMonthDay(cell.key))
          : formatMonthDay(cell.key)
    const state = cell.future ? t.routines.heat.future : !cell.due ? t.routines.heat.notNeeded : cell.done ? t.routines.heat.done : t.routines.heat.missed
    return t.routines.heat.title(when, state)
  }
  return (
    <div
      role="img"
      aria-label={t.routines.heat.summary(
        cells.filter((cell) => cell.due && !cell.future).length,
        cells.filter((cell) => cell.done).length
      )}
      className={cn("grid w-fit gap-[3px]", daily ? "grid-flow-col grid-rows-7" : "grid-flow-col")}
    >
      {cells.map((cell) => (
        <span key={cell.key} title={title(cell)} className={cn("rounded-[2px]", daily ? "size-2.5" : "h-4 w-3", cellTone(cell))} />
      ))}
    </div>
  )
}

function rateOf(routine: Routine, today: DayKey) {
  const t = getT()
  if (routine.cadence === "weekly") return { ...completionRate(routine, addDays(today, -83), today), span: t.routines.rate.weeks12 }
  if (routine.cadence === "monthly") return { ...completionRate(routine, addMonths(today, -5), today), span: t.routines.rate.months6 }
  return { ...completionRate(routine, addDays(today, -29), today), span: t.routines.rate.days30 }
}

/** 例行卡片三层（提炼）：连续几期、完成率、时长和副业；勾选和名称；打卡格子 */
export function RoutineCard({ routine, today }: { routine: Routine; today: DayKey }) {
  const t = useT()
  const toggleRoutine = useWorkbench((state) => state.toggleRoutine)
  const archiveRoutine = useWorkbench((state) => state.archiveRoutine)
  const restoreRoutine = useWorkbench((state) => state.restoreRoutine)
  const openRoutineForm = useUi((state) => state.openRoutineForm)
  const project = useProjectsById().get(routine.projectId ?? "")
  const due = isDueOn(routine, today)
  const done = isDone(routine, today)
  const days = streak(routine, today)
  const rate = rateOf(routine, today)
  const periodic = routine.cadence === "weekly" || routine.cadence === "monthly"

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2 rounded-lg border border-line bg-card px-3 py-2.5 shadow-sm", routine.archived && "opacity-70")}>
      <div className="flex h-[18px] min-w-0 items-center gap-2 text-xs text-fg-2">
        <span className="tabular">{days > 0 ? t.routines.card.streak(days, t.routines.streakUnit[routine.cadence]) : t.routines.card.noStreak}</span>
        {rate.due > 0 && (
          <span className="tabular">
            {rate.span} {Math.round((rate.done / rate.due) * 100)}%
          </span>
        )}
        <span className="tabular">{formatMinutes(routine.estimateMin)}</span>
        {project && <ProjectMark name={project.name} color={project.color} size={16} className="ml-auto" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={t.routines.card.actions(routine.title)} className={cn("text-fg-3 hover:text-fg", !project && "ml-auto")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onSelect={() => openRoutineForm(routine.id)}>
              <Pencil />
              {t.words.edit}
            </DropdownMenuItem>
            {routine.archived ? (
              <DropdownMenuItem onSelect={() => restoreRoutine(routine.id)}>
                <Play />
                {t.routines.card.restore}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={() => {
                  archiveRoutine(routine.id)
                  if (useWorkbench.getState().lastSaveOk) {
                    toast(t.routines.card.archived(routine.title), { action: { label: t.common.undo, onClick: () => restoreRoutine(routine.id) } })
                  }
                }}
              >
                <Pause />
                {t.routines.card.archive}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        disabled={!due}
        onClick={() => toggleRoutine(routine.id, today)}
        className={cn("-ml-0.5 flex min-w-0 items-center gap-1.5 rounded-sm text-left text-sm disabled:cursor-not-allowed", focusRing)}
      >
        <StatusIcon glyph={done ? "check" : due ? "ring" : "dashed"} tone={done ? "done" : due ? "neutral" : "idle"} />
        <span className={cn("min-w-0 truncate", done && "text-fg-2")}>{routine.title}</span>
        {routine.cadence === "weekdays" && <span className="shrink-0 text-xs text-fg-2">{t.catalog.cadence.weekdays}</span>}
        {periodic && !routine.archived && (
          <span className="shrink-0 text-xs text-fg-2">
            {done ? t.routines.card.periodDone(t.catalog.cadencePeriod[routine.cadence]) : t.catalog.cadencePeriod[routine.cadence]}
          </span>
        )}
      </button>
      <HeatGrid routine={routine} today={today} />
    </div>
  )
}
