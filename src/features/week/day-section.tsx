"use client"

import { cn } from "cn"
import { ChevronRight, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Surface } from "@/components/base/board"
import { IconButton } from "@/components/base/icon-button"
import { Button } from "@/components/ui/button"
import { formatDayShort, weekdayLabel } from "@/domain/calendar"
import { formatMinutes } from "@/domain/format"
import type { DayLoad } from "@/domain/planning"
import type { DayKey, Task } from "@/domain/types"
import { focusRing } from "@/lib/styles"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { CapacityBar } from "../common/capacity-bar"
import { TaskRow } from "../common/task-row"
import { useTaskDrop } from "../common/use-task-drop"

export interface DayPlan {
  day: DayKey
  tasks: Task[]
  load: DayLoad
  /** 实际投入的分钟数 */
  logged: number
}

/**
 * 一天：标题行放星期、日期、完成数和容量条，下面是任务行。
 * 任务可以从别的日子或右侧「还没安排」拖进来；过去的日子默认收成一行。
 */
export function DaySection({ plan, today, showDone }: { plan: DayPlan; today: DayKey; showDone: boolean }) {
  const planTask = useWorkbench((state) => state.planTask)
  const moveTasksToDay = useWorkbench((state) => state.moveTasksToDay)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const { day, tasks, load, logged } = plan
  const past = day < today
  const isToday = day === today
  const unfinished = tasks.filter((task) => task.status === "todo" || task.status === "doing")
  const [expanded, setExpanded] = useState(!past || unfinished.length > 0)
  const { over, dropProps } = useTaskDrop((taskId) => planTask(taskId, day))
  const visible = showDone ? tasks : tasks.filter((task) => task.status !== "done")
  const headingId = `day-${day}`

  const moveToToday = () => {
    moveTasksToDay(
      unfinished.map((task) => task.id),
      today
    )
    if (useWorkbench.getState().lastSaveOk) toast.success(`已把 ${unfinished.length} 件挪到今天`)
  }

  return (
    <section
      aria-labelledby={headingId}
      {...dropProps}
      className={cn(
        "flex min-w-0 flex-col rounded-lg bg-column transition-[outline-color] duration-(--dur-fast)",
        over && "outline-2 outline-offset-[-2px] outline-dashed outline-line-3"
      )}
    >
      <header className="flex h-9 min-w-0 items-center gap-2 pr-1.5 pl-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className={cn("flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-hover", focusRing)}
        >
          <ChevronRight
            aria-hidden
            className={cn("size-3.5 shrink-0 text-fg-3 transition-transform duration-(--dur-fast)", expanded && "rotate-90")}
          />
          <h2 id={headingId} className="font-medium">
            {weekdayLabel(day)}
          </h2>
          <span className="text-fg-2 tabular">{formatDayShort(day)}</span>
          {isToday && <span className="rounded-sm bg-fg px-1 text-xs text-white">今天</span>}
          {tasks.length > 0 && (
            <span className="text-xs text-fg-2 tabular">
              {load.doneCount}/{load.count}
            </span>
          )}
        </button>
        {past && logged > 0 && <span className="hidden text-xs text-fg-2 tabular sm:inline">投入 {formatMinutes(logged)}</span>}
        {past && unfinished.length > 0 && (
          <Button variant="ghost" size="sm" className="text-warn hover:text-warn" onClick={moveToToday}>
            {unfinished.length} 件没做完，挪到今天
          </Button>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {!past && <CapacityBar planned={load.planned} capacity={load.capacity} done={load.done} className="w-44 max-sm:hidden" />}
          {!past && (
            <IconButton
              label={`在${weekdayLabel(day)}新建任务`}
              size="icon-xs"
              onClick={() => openTaskForm({ mode: "create", preset: { plannedFor: day } })}
            >
              <Plus />
            </IconButton>
          )}
        </div>
      </header>
      {expanded && (
        <Surface className="mx-1 mb-1 overflow-hidden">
          {visible.length === 0 ? (
            <p className="px-3 py-2 text-sm text-fg-2">{tasks.length > 0 ? "都做完了" : "没有安排"}</p>
          ) : (
            visible.map((task) => (
              <TaskRow key={task.id} task={task} today={today} showTime showPlan={false} draggable className="last:border-b-0" />
            ))
          )}
        </Surface>
      )}
    </section>
  )
}
