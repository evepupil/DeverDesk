import type { ActiveTimer, Task, TaskStatus, TimeEntry } from "../types"
import type { OpContext } from "./context"

export function closeTimer(
  timer: ActiveTimer | null,
  now: number,
  newId: (prefix: string) => string
): TimeEntry | null {
  if (!timer) return null
  const minutes = Math.round((now - timer.startedAt) / 60_000)
  if (minutes < 1) return null
  return { id: newId("E"), taskId: timer.taskId, projectId: timer.projectId, start: timer.startedAt, end: now }
}

export function timerStopsWith(timer: ActiveTimer | null, taskId: string, status: TaskStatus): boolean {
  return timer?.taskId === taskId && (status === "done" || status === "dropped")
}

export function startTimerOn(
  current: ActiveTimer | null,
  task: Task,
  ctx: OpContext
): { timer: ActiveTimer; closedEntry: TimeEntry | null; task: Task } {
  return {
    timer: { taskId: task.id, projectId: task.projectId, label: task.title, startedAt: ctx.now },
    closedEntry: closeTimer(current, ctx.now, ctx.newId),
    task: {
      ...task,
      status: task.status === "done" || task.status === "dropped" ? task.status : "doing",
      plannedFor: task.plannedFor ?? ctx.today,
    },
  }
}

export function logTimeEntry(task: Task, minutes: number, ctx: OpContext): TimeEntry | null {
  if (minutes <= 0) return null
  return {
    id: ctx.newId("E"),
    taskId: task.id,
    projectId: task.projectId,
    start: ctx.now - minutes * 60_000,
    end: ctx.now,
  }
}
