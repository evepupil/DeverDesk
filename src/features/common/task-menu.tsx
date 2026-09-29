"use client"

import { CalendarDays, CircleDashed, MoreHorizontal, Pencil, Play, Square, Trash2, Zap } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"

import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PRIORITY, PRIORITY_ORDER, TASK_STATUS, TASK_STATUS_ORDER } from "@/data/catalog"
import { addDays, formatDayShort, weekDays, weekStart, weekdayLabel } from "@/domain/calendar"
import { taskCode } from "@/domain/tasks"
import { useT } from "@/i18n/react"
import { getT } from "@/i18n/runtime"
import type { DayKey, Priority, Task, TaskStatus } from "@/domain/types"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { PriorityIcon } from "./task-bits"

/** 可以安排到的日子：本周剩下的每一天、下周一 */
export function planTargets(today: DayKey): { day: DayKey; label: string }[] {
  const rest = weekDays(today).filter((day) => day >= today)
  const targets = rest.map((day, i) => ({
    day,
    label: i === 0 ? getT().calendar.today : i === 1 ? getT().calendar.tomorrow : `${weekdayLabel(day)} ${formatDayShort(day)}`,
  }))
  const nextMonday = addDays(weekStart(today), 7)
  if (!targets.some((target) => target.day === nextMonday)) {
    targets.push({ day: nextMonday, label: getT().common.taskMenu.nextMonday(formatDayShort(nextMonday)) })
  }
  return targets
}

/** 行和卡片上的「更多」菜单：拖拽之外，用键盘也能完成排期 */
export function TaskMenu({ task, today, trigger }: { task: Task; today: DayKey; trigger?: ReactNode }) {
  const running = useWorkbench((state) => state.timer?.taskId === task.id)
  const startTimer = useWorkbench((state) => state.startTimer)
  const stopTimer = useWorkbench((state) => state.stopTimer)
  const planTask = useWorkbench((state) => state.planTask)
  const updateTask = useWorkbench((state) => state.updateTask)
  const setStatus = useWorkbench((state) => state.setTaskStatus)
  const deleteTask = useWorkbench((state) => state.deleteTask)
  const restoreTask = useWorkbench((state) => state.restoreTask)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const t = useT()
  const open = task.status !== "done" && task.status !== "dropped"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
        {trigger ?? (
          <Button variant="ghost" size="icon-xs" aria-label={t.common.taskMenu.actions(task.title)} className="text-fg-3 hover:text-fg">
            <MoreHorizontal />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
        {open && (
          <DropdownMenuItem onSelect={() => (running ? stopTimer() : startTimer(task.id))}>
            {running ? <Square /> : <Play />}
            {running ? t.common.timer.stop : t.common.timer.start}
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CalendarDays className="text-fg-2" />
            {t.common.taskMenu.schedule}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {planTargets(today).map((target) => (
              <DropdownMenuItem key={target.day} onSelect={() => planTask(task.id, target.day)}>
                {target.label}
                {task.plannedFor === target.day && <span className="ml-auto text-xs text-fg-2">{t.common.taskMenu.current}</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => planTask(task.id, null)}>{t.common.taskMenu.unschedule}</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Zap className="text-fg-2" />
            {t.common.fields.priority}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup
              value={String(task.priority)}
              onValueChange={(value) => updateTask(task.id, { priority: Number(value) as Priority })}
            >
              {PRIORITY_ORDER.map((priority) => (
                <DropdownMenuRadioItem key={priority} value={String(priority)}>
                  <PriorityIcon priority={priority} />
                  {PRIORITY[priority].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CircleDashed className="text-fg-2" />
            {t.common.fields.status}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup value={task.status} onValueChange={(value) => setStatus(task.id, value as TaskStatus)}>
              {TASK_STATUS_ORDER.map((status) => (
                <DropdownMenuRadioItem key={status} value={status}>
                  <StatusIcon glyph={TASK_STATUS[status].glyph} tone={TASK_STATUS[status].tone} />
                  {TASK_STATUS[status].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openTaskForm({ mode: "edit", taskId: task.id })}>
          <Pencil />
          {t.words.edit}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            deleteTask(task.id)
            toast(t.common.taskMenu.deleted(taskCode(task)), {
              description: task.title,
              action: { label: t.common.undo, onClick: () => restoreTask(task) },
            })
          }}
        >
          <Trash2 />
          {t.words.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
