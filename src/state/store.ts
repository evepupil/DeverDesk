"use client"

import { create } from "zustand"

import { blankWorkbench, emptyWorkbench, generateWorkbench } from "@/data/seed"
import { subscribeLocale } from "@/i18n/runtime"
import { todayKey } from "@/domain/calendar"
import { dirNameKey, validateDirNames } from "@/domain/dir-names"
import type { DirNamesError } from "@/domain/dir-names"
import { toggleDone } from "@/domain/routines"
import {
  addMilestone,
  addSubtask,
  archiveRoutine,
  closeTimer,
  logTimeEntry,
  moveToDay,
  newEntry,
  newProject,
  newRoutine,
  newTask,
  patchEntry,
  patchNote,
  patchProject,
  patchRoutine,
  patchTask,
  planOn,
  removeSubtask,
  restoreRoutine,
  scheduleAt,
  startTimerOn,
  timerStopsWith,
  toggleMilestone,
  toggleSubtask,
  withEntryStatus,
  withStatus,
} from "@/domain/operations"
import type {
  EntryInput,
  OpContext,
  ProjectInput,
  RoutineInput,
  TaskInput,
} from "@/domain/operations"
export type { EntryInput, ProjectInput, RoutineInput, TaskInput } from "@/domain/operations"
import { nextTaskSeq } from "@/domain/tasks"
import type {
  DayKey,
  LedgerEntry,
  Profile,
  Project,
  Routine,
  Task,
  TaskStatus,
  TimeEntry,
  WeekNote,
  WorkbenchData,
} from "@/domain/types"
import { createStorage, type Snapshot, type StoredMeta } from "./storage"

/**
 * 工作台的数据：任务、投入时间、收支、副业、例行、周回顾。
 * 读写都经过存储层（./storage），本地版和在线版只是存储层的实现不同，这里不用管。
 */

const storage = createStorage()

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function opContext(): OpContext {
  const now = Date.now()
  return { now, today: todayKey(now), newId: uid }
}

/** 没改过的样例数据，隔天打开时重新按今天生成，保证演示总是新鲜的 */
function initial(): Snapshot {
  const today = todayKey()
  const stored = storage.load()
  // 在线版：存储层总会给出一份（缓存或空白），直接用，云端的数据不按日子重新生成
  if (storage.kind === "cloud") return stored ?? { meta: { sample: false, seededOn: today, touched: false }, data: blankWorkbench() }
  if (stored && (!stored.meta.sample || stored.meta.touched || stored.meta.seededOn === today)) return stored
  return { meta: { sample: true, seededOn: today, touched: false }, data: generateWorkbench(today, Date.now()) }
}

interface WorkbenchState extends WorkbenchData {
  meta: StoredMeta
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

  saveProject(input: ProjectInput, id?: string): ProjectSaveResult
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

export type ProjectSaveResult = { ok: true; project: Project } | { ok: false; error: DirNamesError }

function dataOf(state: WorkbenchState): WorkbenchData {
  const { profile, projects, tasks, entries, ledger, routines, notes, timer } = state
  return { profile, projects, tasks, entries, ledger, routines, notes, timer }
}

export const useWorkbench = create<WorkbenchState>()((set, get) => {
  const start = initial()

  /** 写入内存并交给存储层保存；没存上时内存里的修改保留，提示用户重试 */
  const commit = (patch: Partial<WorkbenchData>, meta?: StoredMeta) => {
    const current = get()
    const next: Snapshot = { meta: meta ?? { ...current.meta, touched: true }, data: { ...dataOf(current), ...patch } }
    const ok = storage.save(next)
    set((state) => ({
      ...patch,
      meta: next.meta,
      lastSaveOk: ok,
      saveFailures: ok ? state.saveFailures : state.saveFailures + 1,
    }))
  }

  const mapTask = (id: string, change: (task: Task) => Task) =>
    commit({ tasks: get().tasks.map((task) => (task.id === id ? change(task) : task)) })

  return {
    ...start.data,
    meta: start.meta,
    saveFailures: 0,
    lastSaveOk: true,

    createTask(input) {
      const tasks = get().tasks
      const task = newTask(input, nextTaskSeq(tasks), opContext())
      commit({ tasks: [...tasks, task] })
      return task
    },

    updateTask(id, patch) {
      mapTask(id, (task) => patchTask(task, patch, opContext()))
    },

    setTaskStatus(id, status) {
      const state = get()
      const ctx = opContext()
      const timerOnTask = timerStopsWith(state.timer, id, status)
      const entry = timerOnTask ? closeTimer(state.timer, ctx.now, ctx.newId) : null
      commit({
        tasks: state.tasks.map((task) => (task.id === id ? withStatus(task, status, ctx) : task)),
        ...(timerOnTask ? { timer: null, entries: entry ? [...state.entries, entry] : state.entries } : {}),
      })
    },

    toggleTaskDone(id) {
      const task = get().tasks.find((item) => item.id === id)
      if (!task) return
      get().setTaskStatus(id, task.status === "done" ? "todo" : "done")
    },

    planTask(id, day) {
      mapTask(id, (task) => planOn(task, day))
    },

    scheduleTask(id, startAt) {
      const ctx = opContext()
      mapTask(id, (task) => scheduleAt(task, startAt, ctx))
    },

    scheduleMany(times) {
      commit({
        tasks: get().tasks.map((task) => (times.has(task.id) ? { ...task, startAt: times.get(task.id) ?? null } : task)),
      })
    },

    moveTasksToDay(ids, day) {
      const set = new Set(ids)
      commit({
        tasks: get().tasks.map((task) => (set.has(task.id) ? moveToDay(task, day) : task)),
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
      const ctx = opContext()
      mapTask(taskId, (task) => addSubtask(task, title, ctx))
    },

    toggleSubtask(taskId, subtaskId) {
      mapTask(taskId, (task) => toggleSubtask(task, subtaskId))
    },

    removeSubtask(taskId, subtaskId) {
      mapTask(taskId, (task) => removeSubtask(task, subtaskId))
    },

    startTimer(taskId) {
      const state = get()
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task) return
      const ctx = opContext()
      const result = startTimerOn(state.timer, task, ctx)
      commit({
        timer: result.timer,
        entries: result.closedEntry ? [...state.entries, result.closedEntry] : state.entries,
        tasks: state.tasks.map((item) => (item.id === taskId ? startTimerOn(null, item, ctx).task : item)),
      })
    },

    stopTimer() {
      const state = get()
      const ctx = opContext()
      const entry = closeTimer(state.timer, ctx.now, ctx.newId)
      commit({ timer: null, entries: entry ? [...state.entries, entry] : state.entries })
      return entry
    },

    logTime(taskId, minutes) {
      const state = get()
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task) return
      const entry = logTimeEntry(task, minutes, opContext())
      if (!entry) return
      commit({ entries: [...state.entries, entry] })
    },

    saveEntry(input, id) {
      const ledger = get().ledger
      if (id) {
        const updated = ledger.map((entry) => (entry.id === id ? patchEntry(entry, input) : entry))
        commit({ ledger: updated })
        return updated.find((entry) => entry.id === id) as LedgerEntry
      }
      const entry = newEntry(input, opContext())
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
      const ctx = opContext()
      commit({
        ledger: get().ledger.map((entry) => (entry.id === id ? withEntryStatus(entry, status, ctx) : entry)),
      })
    },

    saveProject(input, id) {
      const projects = get().projects
      const current = id ? projects.find((project) => project.id === id) : undefined
      const existingDirNames = current?.dirNames ?? []
      const existingKeys = existingDirNames.map(dirNameKey).sort()
      const requestedKeys = input.dirNames?.map(dirNameKey).sort()
      const dirNamesChanged = requestedKeys !== undefined &&
        (requestedKeys.length !== existingKeys.length || requestedKeys.some((name, index) => name !== existingKeys[index]))
      let dirNames = existingDirNames
      if (dirNamesChanged) {
        const validation = validateDirNames(input.dirNames ?? [], projects, id ?? null)
        if (!validation.ok) return validation
        dirNames = validation.value
      }

      const normalizedInput = { ...input, dirNames }
      if (id) {
        const updated = projects.map((project) => (project.id === id ? patchProject(project, normalizedInput) : project))
        const project = updated.find((project) => project.id === id) as Project
        commit({ projects: updated })
        return { ok: true, project }
      }
      const project = newProject(normalizedInput, opContext())
      commit({ projects: [...projects, project] })
      return { ok: true, project }
    },

    toggleMilestone(projectId, milestoneId) {
      const ctx = opContext()
      commit({ projects: get().projects.map((project) => (project.id === projectId ? toggleMilestone(project, milestoneId, ctx) : project)) })
    },

    addMilestone(projectId, title, due) {
      const ctx = opContext()
      commit({ projects: get().projects.map((project) => (project.id === projectId ? addMilestone(project, title, due, ctx) : project)) })
    },

    toggleRoutine(id, day) {
      commit({ routines: get().routines.map((routine) => (routine.id === id ? toggleDone(routine, day) : routine)) })
    },

    saveRoutine(input, id) {
      const routines = get().routines
      if (id) {
        const updated = routines.map((routine) => (routine.id === id ? patchRoutine(routine, input) : routine))
        commit({ routines: updated })
        return updated.find((routine) => routine.id === id) as Routine
      }
      const routine = newRoutine(input, opContext())
      commit({ routines: [...routines, routine] })
      return routine
    },

    archiveRoutine(id) {
      commit({ routines: get().routines.map((routine) => (routine.id === id ? archiveRoutine(routine) : routine)) })
    },

    restoreRoutine(id) {
      commit({ routines: get().routines.map((routine) => (routine.id === id ? restoreRoutine(routine) : routine)) })
    },

    saveNote(week, patch) {
      const notes = get().notes
      const existing = notes.find((note) => note.week === week) ?? null
      const next = patchNote(existing, week, patch)
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
      const ok = storage.save({ meta: state.meta, data: dataOf(state) })
      set((current) => ({ lastSaveOk: ok, saveFailures: ok ? current.saveFailures : current.saveFailures + 1 }))
      return ok
    },
  }
})

export function workbenchData(state: WorkbenchState): WorkbenchData {
  return dataOf(state)
}

storage.connect?.({
  replace(next) {
    useWorkbench.setState({ ...next.data, meta: next.meta })
  },
})

// 样例数据还没动过时，换语言就按新语言重新生成一份（在线版不生成样例，不受影响）
subscribeLocale(() => {
  const state = useWorkbench.getState()
  if (state.meta.sample && !state.meta.touched) state.resetSample()
})
