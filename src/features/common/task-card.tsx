"use client"

import { cn } from "cn"
import { ListChecks } from "lucide-react"
import type { DragEvent } from "react"

import { LabelChip } from "@/components/base/label-chip"
import { ProjectMark } from "@/components/base/marks"
import { AiMark } from "@/features/ai/ai-mark"
import { PRIORITY } from "@/data/catalog"
import { taskCode } from "@/domain/tasks"
import { useT } from "@/i18n/react"
import type { DayKey, Task } from "@/domain/types"
import { focusRing } from "@/lib/styles"
import { useLoggedByTask, useProjectsById } from "@/state/hooks"
import type { TaskProperty } from "@/state/prefs"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { EstimateText, PriorityIcon, StatusToggle, TimerButton, dueText, planText } from "./task-bits"
import { TaskMenu } from "./task-menu"

const ALL: TaskProperty[] = ["id", "estimate", "project", "priority", "plan", "due"]

export const TASK_DRAG_TYPE = "application/x-workbench-task"

export function startTaskDrag(event: DragEvent, taskId: string) {
  event.dataTransfer.setData(TASK_DRAG_TYPE, taskId)
  event.dataTransfer.setData("text/plain", taskId)
  event.dataTransfer.effectAllowed = "move"
}

function RunningDot() {
  const t = useT()
  return (
    <span className="inline-flex items-center gap-1 text-warn">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-progress opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-1.5 rounded-full bg-progress" />
      </span>
      {t.common.running}
    </span>
  )
}

/**
 * 任务卡片只有三层（提炼）：编号、时长和副业；状态与两行以内的标题；优先级和日期标签。
 * 整张卡可点开详情，标题本身也是按钮，键盘用户按 Tab 就能到。
 */
export function TaskCard({
  task,
  today,
  properties = ALL,
  draggable = false,
  showTime = false,
  className,
}: {
  task: Task
  today: DayKey
  properties?: TaskProperty[]
  draggable?: boolean
  /** 显示时间线上的开始时间（今天页用） */
  showTime?: boolean
  className?: string
}) {
  const project = useProjectsById().get(task.projectId ?? "")
  const logged = useLoggedByTask().get(task.id) ?? 0
  const running = useWorkbench((state) => state.timer?.taskId === task.id)
  const openTask = useUi((state) => state.openTask)
  const show = (property: TaskProperty) => properties.includes(property)
  const plan = show("plan") ? planText(task, today) : null
  const due = show("due") ? dueText(task, today) : null
  const doneSubtasks = task.subtasks.filter((sub) => sub.done).length
  const muted = task.status === "done" || task.status === "dropped"

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (event) => startTaskDrag(event, task.id) : undefined}
      onClick={() => openTask(task.id)}
      className={cn(
        "group flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left shadow-sm transition-[border-color,box-shadow] duration-(--dur-fast) hover:border-line-3",
        running && "border-progress/50",
        draggable && "cursor-grab active:cursor-grabbing",
        className
      )}
    >
      <div className="flex h-[18px] min-w-0 items-center gap-2 text-xs text-fg-2">
        <AiMark origin={task.origin} />
        {showTime && task.startAt && <span className="text-fg tabular">{task.startAt}</span>}
        {show("id") && <span className="tabular">{taskCode(task)}</span>}
        {show("estimate") && <EstimateText task={task} logged={logged} />}
        {running && <RunningDot />}
        <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
          <TimerButton task={task} />
          <TaskMenu task={task} today={today} />
        </span>
        {show("project") && project && <ProjectMark name={project.name} color={project.color} size={18} />}
      </div>
      <div className="flex min-w-0 items-start gap-1.5">
        <StatusToggle task={task} className="-ml-0.5 mt-[-1.5px]" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            openTask(task.id)
          }}
          className={cn("line-clamp-2 min-w-0 text-left text-sm", muted ? "text-fg-2" : "text-fg", focusRing)}
          title={task.title}
        >
          {task.title}
        </button>
      </div>
      {(task.priority > 0 && show("priority")) || plan || due || task.subtasks.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {show("priority") && task.priority > 0 && (
            <LabelChip icon={<PriorityIcon priority={task.priority} />} className="gap-1 pl-1">
              {PRIORITY[task.priority].short}
            </LabelChip>
          )}
          {plan && <LabelChip color={plan.tone === "warn" ? "amber" : undefined}>{plan.text}</LabelChip>}
          {due && <LabelChip color={due.tone === "bad" ? "red" : "gray"}>{due.text}</LabelChip>}
          {task.subtasks.length > 0 && (
            <LabelChip icon={<ListChecks className="size-3.5 text-fg-3" />} className="gap-1 pl-1">
              {doneSubtasks}/{task.subtasks.length}
            </LabelChip>
          )}
        </div>
      ) : null}
    </div>
  )
}
