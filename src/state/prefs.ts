"use client"

import { create } from "zustand"

import type { InsightRange } from "@/domain/insights"
import type { TaskSortBy } from "@/domain/tasks"
import { loadLoose, saveLoose } from "./persistence"

/** 界面偏好：侧栏收起、各页的「显示」设置。只改怎么看，不改数据，存不上也不影响使用 */

export type TaskGroupBy = "status" | "project" | "priority"
export type TaskProperty = "id" | "estimate" | "project" | "priority" | "plan" | "due"
export type LedgerGroupBy = "month" | "project" | "category"

export interface PagePrefs {
  tasks: {
    layout: "board" | "list"
    groupBy: TaskGroupBy
    sortBy: TaskSortBy
    showEnded: boolean
    properties: TaskProperty[]
  }
  week: { showDone: boolean }
  insights: { range: InsightRange; compare: boolean }
  ledger: { groupBy: LedgerGroupBy }
}

export interface Prefs extends PagePrefs {
  sidebarCollapsed: boolean
}

const KEY = "deverdesk:prefs"

export const DEFAULT_PREFS: Prefs = {
  sidebarCollapsed: false,
  tasks: {
    layout: "board",
    groupBy: "status",
    sortBy: "priority",
    showEnded: true,
    properties: ["id", "estimate", "project", "priority", "plan", "due"],
  },
  week: { showDone: true },
  insights: { range: "12w", compare: true },
  ledger: { groupBy: "month" },
}

function initial(): Prefs {
  const stored = loadLoose<Prefs>(KEY)
  if (!stored) return DEFAULT_PREFS
  return {
    sidebarCollapsed: stored.sidebarCollapsed ?? DEFAULT_PREFS.sidebarCollapsed,
    tasks: { ...DEFAULT_PREFS.tasks, ...stored.tasks },
    week: { ...DEFAULT_PREFS.week, ...stored.week },
    insights: { ...DEFAULT_PREFS.insights, ...stored.insights },
    ledger: { ...DEFAULT_PREFS.ledger, ...stored.ledger },
  }
}

interface PrefsState extends Prefs {
  setSidebarCollapsed(collapsed: boolean): void
  set<K extends keyof PagePrefs>(page: K, patch: Partial<PagePrefs[K]>): void
  reset(page: keyof PagePrefs): void
}

export const usePrefs = create<PrefsState>()((set, get) => {
  const persist = () => {
    const { sidebarCollapsed, tasks, week, insights, ledger } = get()
    saveLoose(KEY, { sidebarCollapsed, tasks, week, insights, ledger })
  }
  return {
    ...initial(),
    setSidebarCollapsed: (collapsed) => {
      set({ sidebarCollapsed: collapsed })
      persist()
    },
    set: (page, patch) => {
      set({ [page]: { ...get()[page], ...patch } } as Partial<PrefsState>)
      persist()
    },
    reset: (page) => {
      set({ [page]: DEFAULT_PREFS[page] } as Partial<PrefsState>)
      persist()
    },
  }
})
