"use client"

import { Plus } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { dayKeyOf, formatWeekRange, weekDays } from "@/domain/calendar"
import { formatMinutes } from "@/domain/format"
import { dayLoad, tasksPlannedOn } from "@/domain/planning"
import { routineMinutesOn } from "@/domain/routines"
import { isOpen, isSlipped, minutesOf, sortTasks } from "@/domain/tasks"
import type { Task } from "@/domain/types"
import { DisplayPopover, DisplayRow, DisplaySwitch } from "@/features/shell/display-controls"
import { FilterBar, PageFrame } from "@/features/shell/page-frame"
import { useToday } from "@/state/hooks"
import { usePrefs } from "@/state/prefs"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { CapacityBar } from "../common/capacity-bar"
import { WeekNav, useWeekParam, weekTitle } from "../common/week-nav"
import { DaySection, type DayPlan } from "./day-section"
import { UnplannedColumn } from "./unplanned-column"

function byTime(a: Task, b: Task) {
  if (a.startAt && b.startAt) return a.startAt.localeCompare(b.startAt)
  if (a.startAt) return -1
  if (b.startAt) return 1
  return b.priority - a.priority || a.seq - b.seq
}

/**
 * 周计划：左边七天从上往下排，每天一个容量条，看得出哪天排满了；
 * 右边是还没排日子的任务，拖到某一天就排上。
 */
export function WeekPage() {
  const today = useToday()
  const [week, setWeek] = useWeekParam(today)
  const tasks = useWorkbench((state) => state.tasks)
  const entries = useWorkbench((state) => state.entries)
  const routines = useWorkbench((state) => state.routines)
  const profile = useWorkbench((state) => state.profile)
  const showDone = usePrefs((state) => state.week.showDone)
  const setPrefs = usePrefs((state) => state.set)
  const openTaskForm = useUi((state) => state.openTaskForm)

  const days = useMemo<DayPlan[]>(() => {
    const logged = new Map<string, number>()
    for (const entry of entries) {
      const day = dayKeyOf(new Date(entry.start))
      logged.set(day, (logged.get(day) ?? 0) + minutesOf(entry))
    }
    return weekDays(week).map((day) => ({
      day,
      tasks: tasksPlannedOn(tasks, day).sort(byTime),
      load: dayLoad(tasks, day, profile, routineMinutesOn(routines, day)),
      logged: logged.get(day) ?? 0,
    }))
  }, [tasks, entries, routines, profile, week])

  const earlier = useMemo(
    () => sortTasks(tasks.filter((task) => isSlipped(task, today) && (task.plannedFor ?? "") < week), "priority"),
    [tasks, today, week]
  )
  const unplanned = useMemo(
    () => sortTasks(tasks.filter((task) => isOpen(task) && task.plannedFor === null), "priority"),
    [tasks]
  )

  const upcoming = days.filter((plan) => plan.day >= today)
  const planned = upcoming.reduce((sum, plan) => sum + plan.load.planned, 0)
  const capacity = upcoming.reduce((sum, plan) => sum + plan.load.capacity, 0)
  const count = days.reduce((sum, plan) => sum + plan.load.count, 0)
  const doneCount = days.reduce((sum, plan) => sum + plan.load.doneCount, 0)

  const filterBar = (
    <FilterBar
      left={
        <>
          {upcoming.length > 0 && (
            <CapacityBar planned={planned} capacity={capacity} className="w-[260px] max-w-[55vw]" />
          )}
          <span className="shrink-0 text-xs text-fg-2 tabular">
            完成 {doneCount}/{count} 件
            {upcoming.length === 0 && ` · 投入 ${formatMinutes(days.reduce((sum, plan) => sum + plan.logged, 0))}`}
          </span>
        </>
      }
      right={
        <DisplayPopover onReset={() => setPrefs("week", { showDone: true })}>
          <DisplayRow id="week-show-done" label="显示做完的任务">
            <DisplaySwitch id="week-show-done" checked={showDone} onChange={(value) => setPrefs("week", { showDone: value })} />
          </DisplayRow>
        </DisplayPopover>
      }
    />
  )

  return (
    <PageFrame
      title={weekTitle(week, today)}
      meta={<span className="hidden truncate sm:inline">{formatWeekRange(week)}</span>}
      actions={
        <>
          <WeekNav week={week} today={today} onChange={setWeek} />
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => openTaskForm({ mode: "create", preset: { plannedFor: week > today ? week : today } })}
          >
            <Plus />
            新建任务
          </Button>
        </>
      }
      filterBar={filterBar}
      contentClassName="xl:overflow-hidden"
    >
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:h-full xl:grid-cols-4">
        <div className="scroll-thin flex min-w-0 flex-col gap-(--gap-card) xl:col-span-3 xl:min-h-0 xl:overflow-y-auto">
          {days.map((plan) => (
            <DaySection key={plan.day} plan={plan} today={today} showDone={showDone} />
          ))}
        </div>
        <div className="scroll-thin min-w-0 xl:min-h-0 xl:overflow-y-auto">
          <UnplannedColumn earlier={earlier} unplanned={unplanned} today={today} />
        </div>
      </div>
    </PageFrame>
  )
}
