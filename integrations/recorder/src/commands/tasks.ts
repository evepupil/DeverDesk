import { SETTLE_DELAY } from "../core/constants"
import { computeTasks as computeTasksDefault } from "../core/engine"
import type { ComputedTask, RecorderEvent } from "../core/types"
import { readEvents as readEventsDefault } from "../store/event-log"

export interface TaskListItem {
  date: string
  dir: string
  title: string
  minutes: number
  finishedAt: number
  key: string
}

export interface TasksData {
  since: string
  groups: { dir: string; tasks: TaskListItem[] }[]
  totalTasks: number
  totalMinutes: number
  notice: string
}

export interface TasksDependencies {
  home: string
  now?: number
  readEvents?(home: string, options: { now?: number }): RecorderEvent[]
  compute?(events: readonly RecorderEvent[], now: number): { tasks: ComputedTask[] }
}

function parseSince(value: string): number {
  const match = /^(\d+)(d|h)$/u.exec(value)
  const amount = Number(match?.[1])
  if (!match || !Number.isSafeInteger(amount) || amount < 1) {
    throw Object.assign(new Error("--since 格式应为 Nd 或 Nh，例如 7d、12h"), { exitCode: 2 })
  }
  const duration = amount * (match[2] === "d" ? 24 * 60 : 60) * 60_000
  if (!Number.isSafeInteger(duration)) throw Object.assign(new Error("--since 超出可处理范围"), { exitCode: 2 })
  return duration
}

function itemOf(task: ComputedTask): TaskListItem {
  return {
    date: new Date(task.finishedAt).toISOString().slice(0, 10),
    dir: task.dir,
    title: task.title,
    minutes: task.entries.reduce((sum, entry) => sum + entry.minutes, 0),
    finishedAt: task.finishedAt,
    key: task.key,
  }
}

export async function runTasks(options: { since?: string; json?: boolean }, dependencies: TasksDependencies): Promise<{ data: TasksData; output: string }> {
  const now = dependencies.now ?? Date.now()
  const since = options.since ?? "7d"
  const cutoff = now - parseSince(since)
  const events = (dependencies.readEvents ?? readEventsDefault)(dependencies.home, { now }).filter((event) => event.t >= cutoff)
  const computed = (dependencies.compute ?? computeTasksDefault)(events, now + SETTLE_DELAY)
  const groupsByDir = new Map<string, TaskListItem[]>()
  for (const task of computed.tasks) {
    const group = groupsByDir.get(task.dir) ?? []
    group.push(itemOf(task))
    groupsByDir.set(task.dir, group)
  }
  const groups = [...groupsByDir].map(([dir, tasks]) => ({ dir, tasks }))
  const allTasks = groups.flatMap((group) => group.tasks)
  const data: TasksData = {
    since,
    groups,
    totalTasks: allTasks.length,
    totalMinutes: allTasks.reduce((sum, task) => sum + task.minutes, 0),
    notice: "最近 15 分钟内的可能还会变",
  }
  if (options.json) return { data, output: JSON.stringify(data, null, 2) }
  const lines = groups.flatMap((group) => group.tasks.map((task) =>
    `${task.date}  ${group.dir}  ${task.title}  ${task.minutes} 分钟`))
  lines.push(`合计：${data.totalTasks} 个任务，${data.totalMinutes} 分钟`)
  lines.push(data.notice)
  return { data, output: lines.join("\n") }
}
