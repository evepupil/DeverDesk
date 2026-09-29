"use client"

import { useMemo } from "react"

import { dayLoad, tasksPlannedOn, type DayLoad } from "@/domain/planning"
import { routineMinutesOn } from "@/domain/routines"
import { isSlipped, suggestForDay } from "@/domain/tasks"
import type { DayKey, Task } from "@/domain/types"
import { useWorkbench } from "@/state/store"

export interface TodayPlan {
  /** 今天要做、还没做完的：排了时间的按时间，没排的按优先级 */
  open: Task[]
  /** 今天做完的，最近完成的在前 */
  done: Task[]
  /** 之前计划了、还没做完的 */
  slipped: Task[]
  /** 可以加进今天的 */
  suggestions: Task[]
  /** 今天还没放上时间线的 */
  unscheduled: Task[]
  routineMinutes: number
  load: DayLoad
}

function byPlanOrder(a: Task, b: Task): number {
  if (a.startAt && b.startAt) return a.startAt.localeCompare(b.startAt)
  if (a.startAt) return -1
  if (b.startAt) return 1
  const doing = Number(b.status === "doing") - Number(a.status === "doing")
  const priority = (task: Task) => (task.priority === 0 ? -1 : task.priority)
  return doing || priority(b) - priority(a) || a.seq - b.seq
}

export function useTodayPlan(today: DayKey): TodayPlan {
  const tasks = useWorkbench((state) => state.tasks)
  const routines = useWorkbench((state) => state.routines)
  const profile = useWorkbench((state) => state.profile)

  return useMemo(() => {
    const planned = tasksPlannedOn(tasks, today)
    const open = planned.filter((task) => task.status !== "done").sort(byPlanOrder)
    const done = planned
      .filter((task) => task.status === "done")
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    const slipped = tasks
      .filter((task) => isSlipped(task, today))
      .sort((a, b) => (a.plannedFor ?? "").localeCompare(b.plannedFor ?? "") || b.priority - a.priority)
    const slippedIds = new Set(slipped.map((task) => task.id))
    const suggestions = suggestForDay(tasks, today, 12)
      .filter((task) => !slippedIds.has(task.id))
      .slice(0, 5)
    const routineMinutes = routineMinutesOn(routines, today)
    return {
      open,
      done,
      slipped,
      suggestions,
      unscheduled: open.filter((task) => !task.startAt),
      routineMinutes,
      load: dayLoad(tasks, today, profile, routineMinutes),
    }
  }, [tasks, routines, profile, today])
}
