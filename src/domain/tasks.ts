import { weekStart, addDays } from "./calendar"
import type { DayKey, Task, TaskStatus, TimeEntry } from "./types"

/** 任务的判断、筛选和排序 */

export const OPEN_STATUSES: TaskStatus[] = ["backlog", "todo", "doing"]

export function isOpen(task: Task): boolean {
  return task.status === "backlog" || task.status === "todo" || task.status === "doing"
}

/** 过了截止日还没做完 */
export function isOverdue(task: Task, today: DayKey): boolean {
  return isOpen(task) && task.dueOn !== null && task.dueOn < today
}

/** 计划在之前某天做、到今天还没做完，需要挪到新的日子 */
export function isSlipped(task: Task, today: DayKey): boolean {
  return (task.status === "todo" || task.status === "doing") && task.plannedFor !== null && task.plannedFor < today
}

/**
 * 一段投入实际计入的分钟数：所有统计、时薪、回顾、MCP 读工具都从这里取，不再自己用起止相减。
 * 有 minutes（自动记录并行平分后比起止之差短）就用它，没有（手动计时、补记）按起止相减。
 */
export function minutesOf(entry: TimeEntry): number {
  if (typeof entry.minutes === "number" && Number.isFinite(entry.minutes)) return Math.max(0, Math.round(entry.minutes))
  return Math.max(0, Math.round((entry.end - entry.start) / 60_000))
}

/** 每个任务已经投入的分钟数 */
export function loggedByTask(entries: TimeEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.taskId) continue
    map.set(entry.taskId, (map.get(entry.taskId) ?? 0) + minutesOf(entry))
  }
  return map
}

export type PlanWindow = "today" | "week" | "unplanned" | "overdue"

export function matchPlanWindow(task: Task, window: PlanWindow, today: DayKey): boolean {
  switch (window) {
    case "today":
      return task.plannedFor === today
    case "week": {
      const start = weekStart(today)
      return task.plannedFor !== null && task.plannedFor >= start && task.plannedFor <= addDays(start, 6)
    }
    case "unplanned":
      return isOpen(task) && task.plannedFor === null
    case "overdue":
      return isOverdue(task, today) || isSlipped(task, today)
  }
}

export const TASK_FILTER_KEYS = ["status", "project", "priority", "plan"] as const
export type TaskFilterKey = (typeof TASK_FILTER_KEYS)[number]
export type TaskFilters = Partial<Record<TaskFilterKey, string[]>>

export function projectKeyOf(task: Task): string {
  return task.projectId ?? "none"
}

/** skip 用于统计某个筛选字段各选项的数量：忽略该字段自身的条件 */
export function matchTask(task: Task, filters: TaskFilters, today: DayKey, skip?: TaskFilterKey): boolean {
  const has = (key: TaskFilterKey) => skip !== key && (filters[key]?.length ?? 0) > 0
  if (has("status") && !filters.status?.includes(task.status)) return false
  if (has("project") && !filters.project?.includes(projectKeyOf(task))) return false
  if (has("priority") && !filters.priority?.includes(String(task.priority))) return false
  if (has("plan") && !filters.plan?.some((window) => matchPlanWindow(task, window as PlanWindow, today))) return false
  return true
}

export type TaskSortBy = "priority" | "due" | "created" | "title"

const collator = new Intl.Collator("zh-CN")

function priorityRank(task: Task): number {
  return task.priority === 0 ? -1 : task.priority
}

export function sortTasks(tasks: Task[], by: TaskSortBy): Task[] {
  const sorted = [...tasks]
  const dueValue = (task: Task) => task.dueOn ?? "9999-12-31"
  switch (by) {
    case "priority":
      return sorted.sort(
        (a, b) => priorityRank(b) - priorityRank(a) || dueValue(a).localeCompare(dueValue(b)) || b.seq - a.seq
      )
    case "due":
      return sorted.sort((a, b) => dueValue(a).localeCompare(dueValue(b)) || priorityRank(b) - priorityRank(a))
    case "created":
      return sorted.sort((a, b) => b.createdAt - a.createdAt)
    case "title":
      return sorted.sort((a, b) => collator.compare(a.title, b.title))
  }
}

/**
 * 可以加进某天的任务：没排日子的、之前延期的，逾期和快到截止的优先，再按优先级。
 */
export function suggestForDay(tasks: Task[], day: DayKey, limit = 6): Task[] {
  return tasks
    .filter((task) => (task.status === "todo" || task.status === "doing" || task.status === "backlog") && task.plannedFor !== day)
    .filter((task) => task.plannedFor === null || task.plannedFor < day)
    .sort((a, b) => {
      const urgency = (task: Task) => {
        if (task.dueOn && task.dueOn <= addDays(day, 2)) return 0
        if (task.plannedFor && task.plannedFor < day) return 1
        if (task.status === "doing") return 2
        if (task.status === "todo") return 3
        return 4
      }
      return urgency(a) - urgency(b) || priorityRank(b) - priorityRank(a) || b.seq - a.seq
    })
    .slice(0, limit)
}

/** 界面上显示的任务编号：T-123。两台设备离线各建一件时显示编号可能相同，内部编号不会 */
export function taskCode(task: Pick<Task, "seq">): string {
  return `T-${task.seq}`
}

export function nextTaskSeq(tasks: Task[]): number {
  return tasks.reduce((max, task) => Math.max(max, task.seq), 100) + 1
}
