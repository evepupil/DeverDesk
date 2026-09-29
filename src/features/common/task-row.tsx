"use client"

import { cn } from "cn"

import { LabelChip } from "@/components/base/label-chip"
import { ProjectMark } from "@/components/base/marks"
import type { DayKey, Task } from "@/domain/types"
import { focusRing } from "@/lib/styles"
import { useLoggedByTask, useProjectsById } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { startTaskDrag } from "./task-card"
import { EstimateText, PriorityIcon, StatusToggle, TimerButton, dueText, planText } from "./task-bits"
import { TaskMenu } from "./task-menu"

/**
 * 列表行：状态、编号、开始时间、标题、副业、优先级、日期、时长、计时和更多。
 * 行本身是尺寸容器，放在侧栏这种窄地方时按行宽收起次要的列，标题始终留足位置。
 */
export function TaskRow({
  task,
  today,
  showId = true,
  showTime = false,
  showPlan = true,
  showProject = true,
  draggable = false,
  className,
}: {
  task: Task
  today: DayKey
  showId?: boolean
  showTime?: boolean
  showPlan?: boolean
  /** 已经在某个副业里看时不必再写副业名 */
  showProject?: boolean
  draggable?: boolean
  className?: string
}) {
  const project = useProjectsById().get(task.projectId ?? "")
  const logged = useLoggedByTask().get(task.id) ?? 0
  const running = useWorkbench((state) => state.timer?.taskId === task.id)
  const openTask = useUi((state) => state.openTask)
  const plan = showPlan ? planText(task, today) : null
  const due = dueText(task, today)
  const muted = task.status === "done" || task.status === "dropped"

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (event) => startTaskDrag(event, task.id) : undefined}
      onClick={() => openTask(task.id)}
      className={cn(
        "group @container flex h-9 min-w-0 items-center gap-2.5 border-b border-line px-3 text-sm transition-colors duration-(--dur-fast) hover:bg-hover",
        running && "bg-progress/[0.07] hover:bg-progress/10",
        draggable && "cursor-grab active:cursor-grabbing",
        className
      )}
    >
      <StatusToggle task={task} />
      {showId && <span className="hidden w-12 shrink-0 text-xs text-fg-2 tabular @md:inline">{task.id}</span>}
      {showTime && (
        <span className={cn("w-10 shrink-0 text-xs tabular", task.startAt ? "text-fg" : "text-fg-3")}>
          {task.startAt ?? "—"}
        </span>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          openTask(task.id)
        }}
        className={cn("min-w-0 flex-1 truncate text-left", muted ? "text-fg-2" : "text-fg", focusRing)}
        title={task.title}
      >
        {task.title}
      </button>
      {showProject && project && (
        <span className="hidden max-w-32 min-w-0 shrink items-center gap-1.5 text-xs text-fg-2 @xl:flex">
          <ProjectMark name={project.name} color={project.color} size={14} />
          <span className="truncate">{project.name}</span>
        </span>
      )}
      {task.priority > 0 && <PriorityIcon priority={task.priority} className="hidden @sm:block" />}
      {due && (
        <LabelChip color={due.tone === "bad" ? "red" : "gray"} className="hidden shrink-0 @md:inline-flex">
          {due.text}
        </LabelChip>
      )}
      {plan && plan.tone === "warn" && (
        <LabelChip color="amber" className="hidden shrink-0 @md:inline-flex">
          {plan.text}
        </LabelChip>
      )}
      {plan && plan.tone === "normal" && (
        <span className="hidden w-12 shrink-0 text-right text-xs text-fg-2 @2xl:inline">{plan.text}</span>
      )}
      <span className="w-16 shrink-0 text-right text-xs">
        <EstimateText task={task} logged={logged} />
      </span>
      <TimerButton task={task} />
      <TaskMenu task={task} today={today} />
    </div>
  )
}
