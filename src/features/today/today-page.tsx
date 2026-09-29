"use client"

import { cn } from "cn"
import { CalendarClock, Clock, Plus, Wallet } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

import { BoardColumn, Surface } from "@/components/base/board"
import { Button } from "@/components/ui/button"
import { formatDayLong, minuteOfDay } from "@/domain/calendar"
import { formatMinutes } from "@/domain/format"
import { autoSchedule, blocksFor, tasksPlannedOn } from "@/domain/planning"
import { useT } from "@/i18n/react"
import { FilterBar, PageFrame } from "@/features/shell/page-frame"
import { focusRing } from "@/lib/styles"
import { useToday } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { CapacityBar } from "../common/capacity-bar"
import { PlanColumn, SuggestionsColumn } from "./plan-column"
import { FocusCard, MoneyCard, RoutinesCard } from "./side-column"
import { Timeline } from "./timeline"
import { useTodayPlan } from "./use-today-plan"

/**
 * 今天：左边是今天的计划和可以加进来的事，中间是时间线，右边是例行、收支和投入。
 * 桌面上三列各自滚动；窄屏按「计划 → 时间线 → 其余」往下排。
 */
export function TodayPage() {
  const today = useToday()
  const plan = useTodayPlan(today)
  const tasks = useWorkbench((state) => state.tasks)
  const profile = useWorkbench((state) => state.profile)
  const scheduleMany = useWorkbench((state) => state.scheduleMany)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const setProfileOpen = useUi((state) => state.setProfileOpen)
  const t = useT()

  const todayTasks = useMemo(() => tasksPlannedOn(tasks, today), [tasks, today])
  const scheduledCount = todayTasks.filter((task) => task.startAt).length

  const arrange = () => {
    const from = Math.max(profile.dayStartHour * 60, minuteOfDay(Date.now()))
    const times = autoSchedule(plan.unscheduled, blocksFor(todayTasks, today), from, profile.dayEndHour * 60)
    if (times.size === 0) {
      toast(t.today.arrange.noRoom, { description: t.today.arrange.noRoomHint })
      return
    }
    scheduleMany(times)
    if (!useWorkbench.getState().lastSaveOk) return
    const left = plan.unscheduled.length - times.size
    toast.success(`${t.today.arrange.done(times.size)}${left > 0 ? t.today.arrange.leftover(left) : ""}`, {
      action: { label: t.today.undo, onClick: () => scheduleMany(new Map([...times.keys()].map((id) => [id, null]))) },
    })
  }

  const filterBar = (
    <FilterBar
      left={
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label={t.today.load.aria}
          className={cn("flex min-w-0 items-center gap-3 rounded-md px-1 py-0.5 hover:bg-hover", focusRing)}
        >
          <CapacityBar planned={plan.load.planned} capacity={plan.load.capacity} done={plan.load.done} className="w-[260px] max-w-[60vw]" />
          <span className="hidden shrink-0 text-xs text-fg-2 tabular lg:inline">
            {t.today.load.tasks} {formatMinutes(plan.load.planned - plan.routineMinutes)} · {t.today.load.routines} {formatMinutes(plan.routineMinutes)}
          </span>
        </button>
      }
      right={
        <Button variant="ghost" size="sm" onClick={arrange} disabled={plan.unscheduled.length === 0}>
          <CalendarClock />
          <span className="hidden sm:inline">{t.today.page.autoSchedule}</span>
          <span className="sm:hidden">{t.today.page.autoScheduleShort}</span>
        </Button>
      }
    />
  )

  return (
    <PageFrame
      title={t.today.page.title}
      meta={<span className="truncate">{formatDayLong(today)}</span>}
      actions={
        <>
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => openEntryForm({ mode: "create" })}>
            <Wallet />
            {t.today.page.addEntry}
          </Button>
          <Button variant="outline" size="sm" onClick={() => openTaskForm({ mode: "create", preset: { plannedFor: today } })}>
            <Plus />
            {t.today.page.newTask}
          </Button>
        </>
      }
      filterBar={filterBar}
      contentClassName="xl:overflow-hidden"
    >
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:grid-cols-2 lg:pb-3 xl:h-full xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="scroll-thin flex min-w-0 flex-col gap-(--gap-card) xl:min-h-0 xl:overflow-y-auto">
          <PlanColumn today={today} plan={plan} />
          <SuggestionsColumn tasks={plan.suggestions} today={today} />
        </div>

        <BoardColumn
          icon={<Clock className="size-4 text-fg-2" aria-hidden />}
          title={t.today.timeline.title}
          count={scheduledCount > 0 ? scheduledCount : undefined}
          meta={plan.unscheduled.length > 0 ? t.today.timeline.unplaced(plan.unscheduled.length) : undefined}
          className="h-[560px] lg:self-start xl:h-auto xl:min-h-0 xl:self-stretch"
          bodyClassName="flex-1"
        >
          <Surface className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Timeline today={today} tasks={todayTasks} unscheduled={plan.unscheduled} />
          </Surface>
        </BoardColumn>

        <div className="scroll-thin grid min-w-0 content-start gap-(--gap-card) md:grid-cols-2 lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:grid-cols-1 xl:overflow-y-auto">
          <RoutinesCard today={today} />
          <MoneyCard today={today} />
          <FocusCard today={today} />
        </div>
      </div>
    </PageFrame>
  )
}
