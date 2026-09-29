"use client"

import { create } from "zustand"

import { emptyWorkbench, generateWorkbench } from "@/data/seed"
import { todayKey } from "@/domain/calendar"
import { toggleDone } from "@/domain/routines"
import { nextTaskSeq } from "@/domain/tasks"
import type {
  ActiveTimer,
  DayKey,
  LedgerEntry,
  Milestone,
  Priority,
  Profile,
  Project,
  Routine,
  Task,
  TaskStatus,
  TimeEntry,
  WeekNote,
  WorkbenchData,
} from "@/domain/types"
import { armFailureSimulation, loadVersioned, saveVersioned } from "./persistence"

/**
 * 个人工作台的数据：任务、投入时间、收支、副业、例行、周回顾。
 * 只做前端：存在浏览器本地；以后换成云端数据库时只替换 load / save 这两处。
 */

const KEY = "deverdesk:data"
const VERSION = 1

interface Meta {
  /** 还是样例数据 */
  sample: boolean
  /** 样例生成的日子 */
  seededOn: DayKey
  /** 样例数据被改过 */
  touched: boolean
}

interface Stored {
  meta: Meta
  data: WorkbenchData
}

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

export type EntryInput = Omit<LedgerEntry, "id" | "createdAt">
export type RoutineInput = Pick<Routine, "title" | "cadence" | "estimateMin" | "projectId">
export type ProjectInput = Pick<Project, "name" | "color" | "stage" | "goal" | "monthlyTarget">

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 没改过的样例数据，隔天打开时重新按今天生成，保证演示总是新鲜的 */
function initial(): Stored {
  armFailureSimulation()
  const today = todayKey()
  const stored = loadVersioned<Stored>(KEY, VERSION)
  if (stored && (!stored.meta.sample || stored.meta.touched || stored.meta.seededOn === today)) return stored
  return { meta: { sample: true, seededOn: today, touched: false }, data: generateWorkbench(today, Date.now()) }
}

interface WorkbenchState extends WorkbenchData {
  meta: Meta
  saveFailures: number
  lastSaveOk: boolean

  createTask(input: Partial<TaskInput> & { title: string }): Task
  updateTask(id: string, patch: Partial<TaskInput>): void
  setTaskStatus(id: string, status: TaskStatus): void
  toggleTaskDone(id: string): void
  planTask(id: string, day: DayKey | null): void
  scheduleTask(id: string, startAt: string | null): void
  /** 一次改好几件任务的开始时间；值为 null 表示从时间线上拿下来 */
  scheduleMany(times: Map<string, string | null>): void
  moveTasksToDay(ids: string[], day: DayKey): void
  deleteTask(id: string): void
  restoreTask(task: Task): void
  addSubtask(taskId: string, title: string): void
  toggleSubtask(taskId: string, subtaskId: string): void
  removeSubtask(taskId: string, subtaskId: string): void

  startTimer(taskId: string): void
  stopTimer(): TimeEntry | null
  logTime(taskId: string, minutes: number): void

  saveEntry(input: EntryInput, id?: string): LedgerEntry
  deleteEntry(id: string): void
  restoreEntry(entry: LedgerEntry): void
  setEntryStatus(id: string, status: LedgerEntry["status"]): void

  saveProject(input: ProjectInput, id?: string): Project
  toggleMilestone(projectId: string, milestoneId: string): void
  addMilestone(projectId: string, title: string, due: DayKey): void

  toggleRoutine(id: string, day: DayKey): void
  saveRoutine(input: RoutineInput, id?: string): Routine
  archiveRoutine(id: string): void
  restoreRoutine(id: string): void

  saveNote(week: DayKey, patch: Partial<Omit<WeekNote, "week">>): void
  updateProfile(patch: Partial<Profile>): void

  resetSample(): void
  startFresh(): void
  importData(data: WorkbenchData): void
  retrySave(): boolean
}

function dataOf(state: WorkbenchState): WorkbenchData {
  const { profile, projects, tasks, entries, ledger, routines, notes, timer } = state
  return { profile, projects, tasks, entries, ledger, routines, notes, timer }
}

export const useWorkbench = create<WorkbenchState>()((set, get) => {
  const start = initial()

  /** 写入内存并尝试落盘；落盘失败时内存里的修改保留 */
  const commit = (patch: Partial<WorkbenchData>, meta?: Meta) => {
    const current = get()
    const nextMeta = meta ?? { ...current.meta, touched: true }
    const next = { ...dataOf(current), ...patch }
    const ok = saveVersioned(KEY, VERSION, { meta: nextMeta, data: next } satisfies Stored)
    set((state) => ({
      ...patch,
      meta: nextMeta,
      lastSaveOk: ok,
      saveFailures: ok ? state.saveFailures : state.saveFailures + 1,
    }))
  }

  const mapTask = (id: string, change: (task: Task) => Task) =>
    commit({ tasks: get().tasks.map((task) => (task.id === id ? change(task) : task)) })

  /** 停掉计时器，返回这段时间（不足一分钟不记） */
  const closeTimer = (timer: ActiveTimer | null, now: number): TimeEntry | null => {
    if (!timer) return null
    const minutes = Math.round((now - timer.startedAt) / 60_000)
    if (minutes < 1) return null
    return { id: uid("E"), taskId: timer.taskId, projectId: timer.projectId, start: timer.startedAt, end: now }
  }

  return {
    ...start.data,
    meta: start.meta,
    saveFailures: 0,
    lastSaveOk: true,

    createTask(input) {
      const tasks = get().tasks
      const seq = nextTaskSeq(tasks)
      const task: Task = {
        id: `T-${seq}`,
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
        createdAt: Date.now(),
        completedAt: input.status === "done" ? Date.now() : null,
      }
      commit({ tasks: [...tasks, task] })
      return task
    },

    updateTask(id, patch) {
      mapTask(id, (task) => {
        const next: Task = { ...task, ...patch, title: patch.title !== undefined ? patch.title.trim() : task.title }
        if (patch.plannedFor !== undefined && patch.plannedFor !== task.plannedFor && patch.startAt === undefined) {
          next.startAt = null
        }
        if (!next.plannedFor) next.startAt = null
        if (patch.status && patch.status !== task.status) {
          next.completedAt = patch.status === "done" ? Date.now() : null
        }
        return next
      })
    },

    setTaskStatus(id, status) {
      const state = get()
      const timerOnTask = state.timer?.taskId === id && (status === "done" || status === "dropped")
      const entry = timerOnTask ? closeTimer(state.timer, Date.now()) : null
      commit({
        tasks: state.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                status,
                completedAt: status === "done" ? Date.now() : null,
                plannedFor: status === "done" && !task.plannedFor ? todayKey() : task.plannedFor,
              }
            : task
        ),
        ...(timerOnTask ? { timer: null, entries: entry ? [...state.entries, entry] : state.entries } : {}),
      })
    },

    toggleTaskDone(id) {
      const task = get().tasks.find((item) => item.id === id)
      if (!task) return
      get().setTaskStatus(id, task.status === "done" ? "todo" : "done")
    },

    planTask(id, day) {
      mapTask(id, (task) => ({
        ...task,
        plannedFor: day,
        startAt: day === task.plannedFor ? task.startAt : null,
        status: task.status === "backlog" && day ? "todo" : task.status,
      }))
    },

    scheduleTask(id, startAt) {
      mapTask(id, (task) => ({ ...task, startAt, plannedFor: task.plannedFor ?? todayKey() }))
    },

    scheduleMany(times) {
      commit({
        tasks: get().tasks.map((task) => (times.has(task.id) ? { ...task, startAt: times.get(task.id) ?? null } : task)),
      })
    },

    moveTasksToDay(ids, day) {
      const set = new Set(ids)
      commit({
        tasks: get().tasks.map((task) => (set.has(task.id) ? { ...task, plannedFor: day, startAt: null } : task)),
      })
    },

    deleteTask(id) {
      const state = get()
      commit({
        tasks: state.tasks.filter((task) => task.id !== id),
        timer: state.timer?.taskId === id ? null : state.timer,
      })
    },

    restoreTask(task) {
      const tasks = get().tasks
      if (tasks.some((item) => item.id === task.id)) return
      commit({ tasks: [...tasks, task].sort((a, b) => a.seq - b.seq) })
    },

    addSubtask(taskId, title) {
      mapTask(taskId, (task) => ({ ...task, subtasks: [...task.subtasks, { id: uid("s"), title: title.trim(), done: false }] }))
    },

    toggleSubtask(taskId, subtaskId) {
      mapTask(taskId, (task) => ({
        ...task,
        subtasks: task.subtasks.map((sub) => (sub.id === subtaskId ? { ...sub, done: !sub.done } : sub)),
      }))
    },

    removeSubtask(taskId, subtaskId) {
      mapTask(taskId, (task) => ({ ...task, subtasks: task.subtasks.filter((sub) => sub.id !== subtaskId) }))
    },

    startTimer(taskId) {
      const state = get()
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task) return
      const now = Date.now()
      const entry = closeTimer(state.timer, now)
      commit({
        timer: { taskId, projectId: task.projectId, label: task.title, startedAt: now },
        entries: entry ? [...state.entries, entry] : state.entries,
        tasks: state.tasks.map((item) =>
          item.id === taskId
            ? {
                ...item,
                status: item.status === "done" || item.status === "dropped" ? item.status : "doing",
                plannedFor: item.plannedFor ?? todayKey(),
              }
            : item
        ),
      })
    },

    stopTimer() {
      const state = get()
      const entry = closeTimer(state.timer, Date.now())
      commit({ timer: null, entries: entry ? [...state.entries, entry] : state.entries })
      return entry
    },

    logTime(taskId, minutes) {
      const state = get()
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task || minutes <= 0) return
      const end = Date.now()
      commit({
        entries: [...state.entries, { id: uid("E"), taskId, projectId: task.projectId, start: end - minutes * 60_000, end }],
      })
    },

    saveEntry(input, id) {
      const ledger = get().ledger
      if (id) {
        const updated = ledger.map((entry) => (entry.id === id ? { ...entry, ...input } : entry))
        commit({ ledger: updated })
        return updated.find((entry) => entry.id === id) as LedgerEntry
      }
      const entry: LedgerEntry = { ...input, id: uid("L"), createdAt: Date.now() }
      commit({ ledger: [...ledger, entry] })
      return entry
    },

    deleteEntry(id) {
      commit({ ledger: get().ledger.filter((entry) => entry.id !== id) })
    },

    restoreEntry(entry) {
      const ledger = get().ledger
      if (ledger.some((item) => item.id === entry.id)) return
      commit({ ledger: [...ledger, entry].sort((a, b) => a.date.localeCompare(b.date)) })
    },

    setEntryStatus(id, status) {
      commit({
        ledger: get().ledger.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status,
                date: status === "received" && entry.status === "pending" ? todayKey() : entry.date,
                expectedOn: status === "pending" ? entry.expectedOn : null,
              }
            : entry
        ),
      })
    },

    saveProject(input, id) {
      const projects = get().projects
      if (id) {
        const updated = projects.map((project) => (project.id === id ? { ...project, ...input, name: input.name.trim() } : project))
        commit({ projects: updated })
        return updated.find((project) => project.id === id) as Project
      }
      const project: Project = { ...input, name: input.name.trim(), id: uid("p"), startedOn: todayKey(), milestones: [] }
      commit({ projects: [...projects, project] })
      return project
    },

    toggleMilestone(projectId, milestoneId) {
      commit({
        projects: get().projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                milestones: project.milestones.map((milestone) =>
                  milestone.id === milestoneId ? { ...milestone, doneOn: milestone.doneOn ? null : todayKey() } : milestone
                ),
              }
            : project
        ),
      })
    },

    addMilestone(projectId, title, due) {
      const milestone: Milestone = { id: uid("M"), title: title.trim(), due, doneOn: null }
      commit({
        projects: get().projects.map((project) =>
          project.id === projectId
            ? { ...project, milestones: [...project.milestones, milestone].sort((a, b) => a.due.localeCompare(b.due)) }
            : project
        ),
      })
    },

    toggleRoutine(id, day) {
      commit({ routines: get().routines.map((routine) => (routine.id === id ? toggleDone(routine, day) : routine)) })
    },

    saveRoutine(input, id) {
      const routines = get().routines
      if (id) {
        const updated = routines.map((routine) => (routine.id === id ? { ...routine, ...input, title: input.title.trim() } : routine))
        commit({ routines: updated })
        return updated.find((routine) => routine.id === id) as Routine
      }
      const routine: Routine = { ...input, title: input.title.trim(), id: uid("r"), doneOn: [], createdOn: todayKey(), archived: false }
      commit({ routines: [...routines, routine] })
      return routine
    },

    archiveRoutine(id) {
      commit({ routines: get().routines.map((routine) => (routine.id === id ? { ...routine, archived: true } : routine)) })
    },

    restoreRoutine(id) {
      commit({ routines: get().routines.map((routine) => (routine.id === id ? { ...routine, archived: false } : routine)) })
    },

    saveNote(week, patch) {
      const notes = get().notes
      const existing = notes.find((note) => note.week === week) ?? { week, wins: "", improve: "", next: "" }
      const next = { ...existing, ...patch }
      commit({ notes: [...notes.filter((note) => note.week !== week), next] })
    },

    updateProfile(patch) {
      commit({ profile: { ...get().profile, ...patch } })
    },

    resetSample() {
      const today = todayKey()
      commit(generateWorkbench(today, Date.now()), { sample: true, seededOn: today, touched: false })
    },

    startFresh() {
      commit(emptyWorkbench(dataOf(get())), { sample: false, seededOn: todayKey(), touched: true })
    },

    importData(data) {
      commit(data, { sample: false, seededOn: todayKey(), touched: true })
    },

    retrySave() {
      const state = get()
      const ok = saveVersioned(KEY, VERSION, { meta: state.meta, data: dataOf(state) } satisfies Stored)
      set((current) => ({ lastSaveOk: ok, saveFailures: ok ? current.saveFailures : current.saveFailures + 1 }))
      return ok
    },
  }
})

export function workbenchData(state: WorkbenchState): WorkbenchData {
  return dataOf(state)
}
