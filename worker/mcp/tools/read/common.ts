import { addDays } from "../../../../src/domain/calendar"
import { minutesOf } from "../../../../src/domain/tasks"
import type { Project, Task } from "../../../../src/domain/types"
import { presentEntry, presentLedger, presentProject, presentRoutine, presentTask } from "../shared/present"
import type { PresentContext } from "../shared/present"
import type { Clock, DataSource, TaskQuery, ToolContext, Versioned } from "../../types"

export { addDays, presentEntry, presentLedger, presentProject, presentRoutine, presentTask }
export type { PresentContext }

export function values<T>(records: readonly Versioned<T>[]): T[] {
  return records.map((record) => record.value)
}

export async function countTasksByProject(data: DataSource, query: TaskQuery): Promise<Map<string | null, number>> {
  if (data.countTasksByProject) return data.countTasksByProject(query)
  const counts = new Map<string | null, number>()
  for (const { value } of await data.tasks(query)) {
    counts.set(value.projectId, (counts.get(value.projectId) ?? 0) + 1)
  }
  return counts
}

export async function sumEntryMinutesByTask(data: DataSource, taskIds: string[]): Promise<Map<string, number>> {
  if (data.sumEntryMinutesByTask) return data.sumEntryMinutesByTask(taskIds)
  const totals = new Map<string, number>()
  for (const { value } of await data.entries({ taskIds })) {
    if (value.taskId === null) continue
    totals.set(value.taskId, (totals.get(value.taskId) ?? 0) + minutesOf(value))
  }
  return totals
}

export function presentationContext(ctx: ToolContext, projects: readonly Versioned<Project>[]): PresentContext {
  return { clock: ctx.clock, projects: new Map(projects.map(({ value }) => [value.id, value])) }
}

export function taskMap(tasks: readonly Task[]): Map<string, Task> {
  return new Map(tasks.map((task) => [task.id, task]))
}

export function localDayBounds(clock: Clock, start: string, end: string): { from: number; to: number } {
  return { from: clock.startOfDay(start), to: clock.startOfDay(addDays(end, 1)) }
}

/** ISO weekday number (Monday=1, Sunday=7), derived from the local date key. */
export function weekdayOf(day: string): number {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function uniqueTasks(...groups: readonly Task[][]): Task[] {
  const result = new Map<string, Task>()
  for (const group of groups) for (const task of group) result.set(task.id, task)
  return [...result.values()]
}

export function scheduleOrder(a: Task, b: Task): number {
  if (a.startAt && b.startAt) return a.startAt.localeCompare(b.startAt)
  if (a.startAt) return -1
  if (b.startAt) return 1
  const doing = Number(b.status === "doing") - Number(a.status === "doing")
  const priority = (task: Task) => task.priority === 0 ? -1 : task.priority
  return doing || priority(b) - priority(a) || a.seq - b.seq
}
