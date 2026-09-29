"use client"

import { useEffect, useMemo, useState } from "react"

import { todayKey } from "@/domain/calendar"
import { loggedByTask } from "@/domain/tasks"
import type { Project, WorkbenchData } from "@/domain/types"
import { useWorkbench } from "./store"

/** 工作台里多处共用的派生数据 */

export function useWorkbenchData(): WorkbenchData {
  const profile = useWorkbench((state) => state.profile)
  const projects = useWorkbench((state) => state.projects)
  const tasks = useWorkbench((state) => state.tasks)
  const entries = useWorkbench((state) => state.entries)
  const ledger = useWorkbench((state) => state.ledger)
  const routines = useWorkbench((state) => state.routines)
  const notes = useWorkbench((state) => state.notes)
  const timer = useWorkbench((state) => state.timer)
  return useMemo(
    () => ({ profile, projects, tasks, entries, ledger, routines, notes, timer }),
    [profile, projects, tasks, entries, ledger, routines, notes, timer]
  )
}

/** 当前时刻，按给定间隔刷新（时间线的「现在」线、计时器都靠它） */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

/** 今天的日期，过了零点自动换天 */
export function useToday(): string {
  return todayKey(useNow(60_000))
}

export function useProjectsById(): Map<string, Project> {
  const projects = useWorkbench((state) => state.projects)
  return useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
}

export function useLoggedByTask(): Map<string, number> {
  const entries = useWorkbench((state) => state.entries)
  return useMemo(() => loggedByTask(entries), [entries])
}
