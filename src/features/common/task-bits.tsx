"use client"

import { cn } from "cn"
import { Play, Square } from "lucide-react"

import { TierIcon } from "@/components/base/label-chip"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PRIORITY, TASK_STATUS } from "@/data/catalog"
import { diffDays, formatRelativeDay } from "@/domain/calendar"
import { formatMinutes } from "@/domain/format"
import { useT } from "@/i18n/react"
import { getT } from "@/i18n/runtime"
import type { DayKey, Priority, Project, Task } from "@/domain/types"
import { focusRing } from "@/lib/styles"
import { useWorkbench } from "@/state/store"

/** 任务界面里反复用到的小部件 */

export function TaskStatusIcon({ task, className }: { task: Task; className?: string }) {
  const meta = TASK_STATUS[task.status]
  return <StatusIcon glyph={meta.glyph} tone={meta.tone} label={meta.label} className={className} />
}

/** 点状态图形直接勾完成；已完成的再点一次回到待办 */
export function StatusToggle({ task, className }: { task: Task; className?: string }) {
  const toggle = useWorkbench((state) => state.toggleTaskDone)
  const t = useT()
  const done = task.status === "done"
  return (
    <button
      type="button"
      aria-label={done ? t.common.taskBits.reopen(task.title) : t.common.taskBits.complete(task.title)}
      onClick={(event) => {
        event.stopPropagation()
        toggle(task.id)
      }}
      className={cn(
        "group/toggle relative flex size-5 shrink-0 items-center justify-center rounded-full transition-transform duration-(--dur-fast) hover:scale-110 active:scale-95",
        focusRing,
        className
      )}
    >
      <TaskStatusIcon task={task} className={cn(!done && "group-hover/toggle:opacity-0")} />
      {!done && (
        <StatusIcon glyph="check" tone="done" className="absolute opacity-0 group-hover/toggle:opacity-60" />
      )}
    </button>
  )
}

/** 优先级：紧急是红底感叹号，高中低是三根竖条亮几根，无优先级是三个点 */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  if (priority === 4) {
    return (
      <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden className={cn("shrink-0", className)}>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="var(--risk)" />
        <path d="M7 3.8v3.7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="9.9" r="0.9" fill="#fff" />
      </svg>
    )
  }
  if (priority === 0) {
    return (
      <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden className={cn("shrink-0", className)}>
        {[3, 7, 11].map((x) => (
          <circle key={x} cx={x} cy={7} r={1.1} fill="var(--text-tertiary)" />
        ))}
      </svg>
    )
  }
  return <TierIcon tier={priority as 1 | 2 | 3} className={className} />
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PriorityIcon priority={priority} />
      {PRIORITY[priority].label}
    </span>
  )
}

export function ProjectLabel({ project, size = 14 }: { project: Project | null | undefined; size?: number }) {
  const t = useT()
  if (!project) return <span className="text-fg-2">{t.common.personal}</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ProjectMark name={project.name} color={project.color} size={size} />
      <span className="truncate">{project.name}</span>
    </span>
  )
}

/** 计划日期的说法：今天、明天、周五；过了日子还没做完是「延期 N 天」 */
export function planText(task: Task, today: DayKey): { text: string; tone: "normal" | "warn" } | null {
  if (!task.plannedFor) return null
  if (task.status !== "done" && task.status !== "dropped" && task.plannedFor < today) {
    return { text: getT().common.taskBits.late(diffDays(today, task.plannedFor)), tone: "warn" }
  }
  return { text: formatRelativeDay(task.plannedFor, today), tone: "normal" }
}

/** 截止日期：只在还没做完时提示 */
export function dueText(task: Task, today: DayKey): { text: string; tone: "normal" | "bad" } | null {
  if (!task.dueOn || task.status === "done" || task.status === "dropped") return null
  const left = diffDays(task.dueOn, today)
  if (left < 0) return { text: getT().common.taskBits.overdue(-left), tone: "bad" }
  if (left === 0) return { text: getT().common.taskBits.dueToday, tone: "bad" }
  if (left <= 7) return { text: getT().common.taskBits.dueBy(formatRelativeDay(task.dueOn, today)), tone: "normal" }
  return null
}

export function EstimateText({ task, logged }: { task: Task; logged: number }) {
  if (logged > 0) {
    const over = logged > task.estimateMin
    return (
      <span className={cn("tabular", over ? "text-warn" : "text-fg-2")}>
        {formatMinutes(logged)}/{formatMinutes(task.estimateMin)}
      </span>
    )
  }
  return <span className="text-fg-2 tabular">{formatMinutes(task.estimateMin)}</span>
}

/** 开始 / 停止计时；同一时间只有一个任务在计时 */
export function TimerButton({ task, className }: { task: Task; className?: string }) {
  const running = useWorkbench((state) => state.timer?.taskId === task.id)
  const start = useWorkbench((state) => state.startTimer)
  const stop = useWorkbench((state) => state.stopTimer)
  const t = useT()
  if (task.status === "done" || task.status === "dropped") return null
  const label = running ? t.common.timer.stop : t.common.timer.start
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={running ? t.common.taskBits.stopAria(task.title) : t.common.taskBits.startAria(task.title)}
          onClick={(event) => {
            event.stopPropagation()
            if (running) stop()
            else start(task.id)
          }}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors duration-(--dur-fast)",
            running ? "bg-progress/15 text-warn hover:bg-progress/25" : "text-fg-3 hover:bg-hover hover:text-fg",
            focusRing,
            className
          )}
        >
          {running ? <Square className="size-3 fill-current" /> : <Play className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
