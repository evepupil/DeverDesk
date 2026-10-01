// 统一的输出形状：22 个工具往外发任务、投入、收支、副业、例行时都过这里的函数，
// 保证 AI 看到的字段口径一致。规格见 docs/模块设计/MCP服务.md「统一的输出形状」。
// 墙上时间（计划日、开始时间）原样输出；这里的时间戳都是真实时间，格式化一律走 ctx.clock。
import { minutesOf, taskCode } from "../../../../src/domain/tasks"
import type {
  LedgerEntry,
  Project,
  Routine,
  Task,
  TimeEntry,
} from "../../../../src/domain/types"
import type { Clock } from "../../types"

/** 每次输出需要的上下文：时钟和全部副业（拿名称用） */
export interface PresentContext {
  clock: Clock
  projects: ReadonlyMap<string, Project>
}

export interface ProjectRef {
  id: string
  name: string
}

/** 副业引用：查不到的编号显示为已删除的副业 */
export function projectRef(projectId: string | null, ctx: PresentContext): ProjectRef | null {
  if (projectId === null) return null
  const project = ctx.projects.get(projectId)
  if (project) return { id: project.id, name: project.name }
  return { id: projectId, name: "(deleted project)" }
}

function withByAi<T extends object>(output: T, task: { origin?: "ai" | "coding" }): T & { byAi?: true } {
  if (task.origin !== "ai") return output
  return { ...output, byAi: true as const }
}

export interface CompactSubtask {
  id: string
  title: string
  done: boolean
}

export interface CompactTask extends Record<string, unknown> {
  id: string
  code: string
  title: string
  status: string
  priority: number
  project: ProjectRef | null
  estimateMin: number
  plannedFor: string | null
  startAt: string | null
  dueOn: string | null
  /** 完成数和总数；有子任务时再带上每一条（编号、标题、是否完成），改子任务时按它们来指 */
  subtasks: { done: number; total: number; items?: CompactSubtask[] }
  /** 备注原文，没有备注时不给这个键 */
  notes?: string
  /** 已投入分钟数，只在查询带了投入记录时给 */
  loggedMin?: number
  completedAt: string | null
  byAi?: true
}

function presentSubtasks(task: Task): CompactTask["subtasks"] {
  const items = task.subtasks.map(({ id, title, done }) => ({ id, title, done }))
  return {
    done: items.filter((item) => item.done).length,
    total: items.length,
    ...(items.length > 0 ? { items } : {}),
  }
}

export function presentTask(task: Task, ctx: PresentContext, loggedMin?: number): CompactTask {
  const base: CompactTask = {
    id: task.id,
    code: taskCode(task),
    title: task.title,
    status: task.status,
    priority: task.priority,
    project: projectRef(task.projectId, ctx),
    estimateMin: task.estimateMin,
    plannedFor: task.plannedFor,
    startAt: task.startAt,
    dueOn: task.dueOn,
    subtasks: presentSubtasks(task),
    completedAt: task.completedAt === null ? null : ctx.clock.formatLocal(task.completedAt),
  }
  const withNotes = task.notes ? { ...base, notes: task.notes } : base
  const withLogged = loggedMin === undefined ? withNotes : { ...withNotes, loggedMin }
  return withByAi(withLogged, task)
}

export interface CompactLedger {
  id: string
  kind: string
  amount: number
  project: ProjectRef | null
  category: string
  channel: string
  status: string
  date: string
  expectedOn: string | null
  note: string
  externalId?: string
  byAi?: true
}

export function presentLedger(entry: LedgerEntry, ctx: PresentContext): CompactLedger {
  const base: CompactLedger = {
    id: entry.id,
    kind: entry.kind,
    amount: entry.amount,
    project: projectRef(entry.projectId, ctx),
    category: entry.category,
    channel: entry.channel,
    status: entry.status,
    date: entry.date,
    expectedOn: entry.expectedOn,
    note: entry.note,
  }
  const withExternal = entry.externalId === undefined ? base : { ...base, externalId: entry.externalId }
  return withByAi(withExternal, entry)
}

export interface CompactEntry {
  id: string
  start: string
  end: string
  minutes: number
  project: ProjectRef | null
  task: { id: string; code: string; title: string } | { id: string } | null
  byAi?: true
}

export function presentEntry(
  entry: TimeEntry,
  ctx: PresentContext,
  tasks?: ReadonlyMap<string, Task>
): CompactEntry {
  const task = entry.taskId === null ? null : presentEntryTask(entry.taskId, tasks)
  const base: CompactEntry = {
    id: entry.id,
    start: ctx.clock.formatLocal(entry.start),
    end: ctx.clock.formatLocal(entry.end),
    minutes: minutesOf(entry),
    project: projectRef(entry.projectId, ctx),
    task,
  }
  return withByAi(base, entry)
}

function presentEntryTask(taskId: string, tasks: ReadonlyMap<string, Task> | undefined) {
  const task = tasks?.get(taskId)
  if (!task) return { id: taskId }
  return { id: task.id, code: taskCode(task), title: task.title }
}

export interface CompactProject {
  id: string
  name: string
  color: string
  stage: string
  goal: string
  monthlyTarget: number | null
  startedOn: string
}

export function presentProject(project: Project): CompactProject {
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    stage: project.stage,
    goal: project.goal,
    monthlyTarget: project.monthlyTarget,
    startedOn: project.startedOn,
  }
}

export interface CompactRoutine {
  id: string
  title: string
  cadence: string
  estimateMin: number
  project: ProjectRef | null
  archived: boolean
}

export function presentRoutine(routine: Routine, ctx: PresentContext): CompactRoutine {
  return {
    id: routine.id,
    title: routine.title,
    cadence: routine.cadence,
    estimateMin: routine.estimateMin,
    project: projectRef(routine.projectId, ctx),
    archived: routine.archived,
  }
}
