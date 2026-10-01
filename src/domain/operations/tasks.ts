import type { DayKey, Priority, Task, TaskStatus } from "../types"
import type { OpContext } from "./context"

export interface TaskInput {
  title: string
  projectId: string | null
  status: TaskStatus
  priority: Priority
  estimateMin: number
  plannedFor: DayKey | null
  startAt: string | null
  dueOn: DayKey | null
  notes: string
}

export function newTask(input: Partial<TaskInput> & { title: string }, seq: number, ctx: OpContext): Task {
  return {
    id: ctx.newId("t"),
    seq,
    title: input.title.trim(),
    projectId: input.projectId ?? null,
    status: input.status ?? "todo",
    priority: input.priority ?? 0,
    estimateMin: input.estimateMin ?? 30,
    plannedFor: input.plannedFor ?? null,
    startAt: input.plannedFor ? (input.startAt ?? null) : null,
    dueOn: input.dueOn ?? null,
    notes: input.notes ?? "",
    subtasks: [],
    createdAt: ctx.now,
    completedAt: input.status === "done" ? ctx.now : null,
  }
}

export function patchTask(task: Task, patch: Partial<TaskInput>, ctx: OpContext): Task {
  const next: Task = { ...task, ...patch, title: patch.title !== undefined ? patch.title.trim() : task.title }
  if (patch.plannedFor !== undefined && patch.plannedFor !== task.plannedFor && patch.startAt === undefined) {
    next.startAt = null
  }
  if (!next.plannedFor) next.startAt = null
  if (patch.status && patch.status !== task.status) {
    next.completedAt = patch.status === "done" ? ctx.now : null
  }
  return next
}

export function withStatus(task: Task, status: TaskStatus, ctx: OpContext): Task {
  return {
    ...task,
    status,
    completedAt: status === "done" ? ctx.now : null,
    plannedFor: status === "done" && !task.plannedFor ? ctx.today : task.plannedFor,
  }
}

export function planOn(task: Task, day: DayKey | null): Task {
  return {
    ...task,
    plannedFor: day,
    startAt: day === task.plannedFor ? task.startAt : null,
    status: task.status === "backlog" && day ? "todo" : task.status,
  }
}

export function scheduleAt(task: Task, startAt: string | null, ctx: OpContext): Task {
  return { ...task, startAt, plannedFor: task.plannedFor ?? ctx.today }
}

export function moveToDay(task: Task, day: DayKey): Task {
  return { ...task, plannedFor: day, startAt: null }
}

export function addSubtask(task: Task, title: string, ctx: OpContext): Task {
  return { ...task, subtasks: [...task.subtasks, { id: ctx.newId("s"), title: title.trim(), done: false }] }
}

export function toggleSubtask(task: Task, subtaskId: string): Task {
  return {
    ...task,
    subtasks: task.subtasks.map((subtask) =>
      subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask
    ),
  }
}

export function removeSubtask(task: Task, subtaskId: string): Task {
  return { ...task, subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId) }
}
