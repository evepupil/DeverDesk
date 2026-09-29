"use client"

import { create } from "zustand"

import type { EntryInput, TaskInput } from "./store"

/** 浮层开合：搜索、快捷键说明、手机侧栏、任务详情、各种表单、手机快速记录，以及提醒已读 */

export type TaskFormState = { mode: "create"; preset?: Partial<TaskInput> } | { mode: "edit"; taskId: string }
export type EntryFormState = { mode: "create"; preset?: Partial<EntryInput> } | { mode: "edit"; entryId: string }

interface UiState {
  commandOpen: boolean
  shortcutsOpen: boolean
  mobileNavOpen: boolean
  taskSheetId: string | null
  taskForm: TaskFormState | null
  entryForm: EntryFormState | null
  routineForm: { routineId: string | null } | null
  projectForm: { projectId: string | null } | null
  quickAddOpen: boolean
  profileOpen: boolean
  readAlertIds: string[]
  setCommandOpen(open: boolean): void
  setShortcutsOpen(open: boolean): void
  setMobileNavOpen(open: boolean): void
  openTask(taskId: string): void
  closeTask(): void
  openTaskForm(form: TaskFormState): void
  closeTaskForm(): void
  openEntryForm(form: EntryFormState): void
  closeEntryForm(): void
  openRoutineForm(routineId: string | null): void
  closeRoutineForm(): void
  openProjectForm(projectId: string | null): void
  closeProjectForm(): void
  setQuickAddOpen(open: boolean): void
  setProfileOpen(open: boolean): void
  markAlertsRead(ids: string[]): void
}

export const useUi = create<UiState>()((set) => ({
  commandOpen: false,
  shortcutsOpen: false,
  mobileNavOpen: false,
  taskSheetId: null,
  taskForm: null,
  entryForm: null,
  routineForm: null,
  projectForm: null,
  quickAddOpen: false,
  profileOpen: false,
  readAlertIds: [],
  setCommandOpen: (open) => set({ commandOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  openTask: (taskId) => set({ taskSheetId: taskId }),
  closeTask: () => set({ taskSheetId: null }),
  openTaskForm: (form) => set({ taskForm: form }),
  closeTaskForm: () => set({ taskForm: null }),
  openEntryForm: (form) => set({ entryForm: form }),
  closeEntryForm: () => set({ entryForm: null }),
  openRoutineForm: (routineId) => set({ routineForm: { routineId } }),
  closeRoutineForm: () => set({ routineForm: null }),
  openProjectForm: (projectId) => set({ projectForm: { projectId } }),
  closeProjectForm: () => set({ projectForm: null }),
  setQuickAddOpen: (open) => set({ quickAddOpen: open }),
  setProfileOpen: (open) => set({ profileOpen: open }),
  markAlertsRead: (ids) => set((state) => ({ readAlertIds: Array.from(new Set([...state.readAlertIds, ...ids])) })),
}))
