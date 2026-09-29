"use client"

import { cn } from "cn"
import { Lightbulb, Plus, Sun } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { BoardColumn, CollapsedRow, Surface } from "@/components/base/board"
import { IconButton } from "@/components/base/icon-button"
import { LabelChip } from "@/components/base/label-chip"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { diffDays } from "@/domain/calendar"
import { formatMinutes } from "@/domain/format"
import type { DayKey, Task } from "@/domain/types"
import { useT } from "@/i18n/react"
import { focusRing } from "@/lib/styles"
import { useProjectsById } from "@/state/hooks"
import type { TaskProperty } from "@/state/prefs"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { QuickAdd } from "../common/quick-add"
import { TaskStatusIcon, dueText } from "../common/task-bits"
import { TaskCard, startTaskDrag } from "../common/task-card"
import type { TodayPlan } from "./use-today-plan"

const CARD_PROPERTIES: TaskProperty[] = ["id", "estimate", "project", "priority", "due"]

/** 之前计划了没做完的：一键挪到今天，可撤销 */
function RolloverCard({ tasks, today }: { tasks: Task[]; today: DayKey }) {
  const moveTasksToDay = useWorkbench((state) => state.moveTasksToDay)
  const updateTask = useWorkbench((state) => state.updateTask)
  const openTask = useUi((state) => state.openTask)
  const t = useT()

  const moveAll = () => {
    const before = tasks.map((task) => ({ id: task.id, plannedFor: task.plannedFor, startAt: task.startAt }))
    moveTasksToDay(
      tasks.map((task) => task.id),
      today
    )
    if (!useWorkbench.getState().lastSaveOk) return
    toast.success(t.today.rollover.moved(tasks.length), {
      action: {
        label: t.today.undo,
        onClick: () => before.forEach((item) => updateTask(item.id, { plannedFor: item.plannedFor, startAt: item.startAt })),
      },
    })
  }

  return (
    <Surface className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <StatusIcon glyph="half" tone="progress" />
        <span className="min-w-0 flex-1 truncate text-sm">{t.today.rollover.count(tasks.length)}</span>
        <Button variant="outline" size="sm" onClick={moveAll}>
          {t.today.rollover.move}
        </Button>
      </div>
      <ul className="flex flex-col pl-[22px]">
        {tasks.slice(0, 3).map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => openTask(task.id)}
              className={cn("flex h-6 w-full min-w-0 items-center gap-2 rounded-sm text-left text-xs text-fg-2 hover:text-fg", focusRing)}
            >
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              <span className="shrink-0 text-warn tabular">{t.today.rollover.late(diffDays(today, task.plannedFor ?? today))}</span>
            </button>
          </li>
        ))}
        {tasks.length > 3 && (
          <li>
            <Link href="/tasks?plan=overdue" className={cn("text-xs text-fg-2 hover:text-fg", focusRing)}>
              {t.today.rollover.more(tasks.length - 3)}
            </Link>
          </li>
        )}
      </ul>
    </Surface>
  )
}

/** 今天的计划：还没做完的卡片（可拖到时间线）、一行快速添加、做完的收成短行 */
export function PlanColumn({ today, plan }: { today: DayKey; plan: TodayPlan }) {
  const openTaskForm = useUi((state) => state.openTaskForm)
  const t = useT()
  const [showDone, setShowDone] = useState(false)
  const total = plan.open.length + plan.done.length

  return (
    <BoardColumn
      icon={<Sun className="size-4 text-fg-2" aria-hidden />}
      title={t.today.plan.title}
      count={total > 0 ? `${plan.done.length}/${total}` : undefined}
      meta={total > 0 ? formatMinutes(plan.load.planned - plan.routineMinutes) : undefined}
      actions={
        <IconButton label={t.today.plan.newTask} size="icon-xs" onClick={() => openTaskForm({ mode: "create", preset: { plannedFor: today } })}>
          <Plus />
        </IconButton>
      }
    >
      {plan.slipped.length > 0 && <RolloverCard tasks={plan.slipped} today={today} />}
      {plan.open.map((task) => (
        <TaskCard key={task.id} task={task} today={today} properties={CARD_PROPERTIES} draggable showTime />
      ))}
      {plan.open.length === 0 && (
        <p className="px-2 py-1 text-sm text-fg-2">{plan.done.length > 0 ? t.today.plan.allDone : t.today.plan.empty}</p>
      )}
      <Surface className="overflow-hidden">
        <QuickAdd defaultDay={today} today={today} placeholder={t.today.plan.placeholder} />
      </Surface>
      {plan.done.length > 0 && (
        <>
          <CollapsedRow
            icon={<StatusIcon glyph="check" tone="done" />}
            label={t.today.plan.done}
            count={plan.done.length}
            aria-expanded={showDone}
            onClick={() => setShowDone((current) => !current)}
          />
          {showDone &&
            plan.done.map((task) => <TaskCard key={task.id} task={task} today={today} properties={CARD_PROPERTIES} showTime />)}
        </>
      )}
    </BoardColumn>
  )
}

/** 可以加进今天的：快到截止、进行中和高优先的排前面；可以点加号，也可以拖到时间线上 */
export function SuggestionsColumn({ tasks, today }: { tasks: Task[]; today: DayKey }) {
  const planTask = useWorkbench((state) => state.planTask)
  const updateTask = useWorkbench((state) => state.updateTask)
  const openTask = useUi((state) => state.openTask)
  const projectsById = useProjectsById()
  const t = useT()
  if (tasks.length === 0) return null

  return (
    <BoardColumn icon={<Lightbulb className="size-4 text-fg-2" aria-hidden />} title={t.today.suggestions.title} count={tasks.length}>
      <Surface className="overflow-hidden">
        <ul>
          {tasks.map((task) => {
            const project = projectsById.get(task.projectId ?? "")
            const due = dueText(task, today)
            return (
              <li
                key={task.id}
                draggable
                onDragStart={(event) => startTaskDrag(event, task.id)}
                className="flex h-9 min-w-0 cursor-grab items-center gap-2 border-b border-line pr-1.5 pl-3 last:border-b-0 active:cursor-grabbing"
              >
                <TaskStatusIcon task={task} />
                <button
                  type="button"
                  onClick={() => openTask(task.id)}
                  className={cn("min-w-0 flex-1 truncate text-left text-sm", focusRing)}
                  title={task.title}
                >
                  {task.title}
                </button>
                {due && (
                  <LabelChip color={due.tone === "bad" ? "red" : "gray"} className="hidden shrink-0 sm:inline-flex">
                    {due.text}
                  </LabelChip>
                )}
                {project && <ProjectMark name={project.name} color={project.color} size={14} />}
                <span className="w-9 shrink-0 text-right text-xs text-fg-2 tabular">{formatMinutes(task.estimateMin)}</span>
                <IconButton
                  label={t.today.suggestions.add(task.title)}
                  size="icon-xs"
                  onClick={() => {
                    planTask(task.id, today)
                    if (useWorkbench.getState().lastSaveOk) {
                      toast.success(t.today.suggestions.added, {
                        description: task.title,
                        action: {
                          label: t.today.undo,
                          onClick: () => updateTask(task.id, { plannedFor: task.plannedFor, startAt: task.startAt, status: task.status }),
                        },
                      })
                    }
                  }}
                >
                  <Plus />
                </IconButton>
              </li>
            )
          })}
        </ul>
      </Surface>
    </BoardColumn>
  )
}
