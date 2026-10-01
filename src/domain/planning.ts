import { isWeekend, minutesToTime, timeToMinutes } from "./calendar"
import type { DayKey, Profile, Task } from "./types"

/** 排期：每天有多少可用时间、排了多少、时间线上怎么摆 */

export const SLOT_STEP = 15
export const MIN_BLOCK = 15

export function capacityFor(day: DayKey, profile: Profile): number {
  return isWeekend(day) ? profile.weekendMin : profile.weekdayMin
}

export function tasksPlannedOn(tasks: Task[], day: DayKey): Task[] {
  return tasks.filter((task) => task.plannedFor === day && task.status !== "dropped")
}

export interface DayLoad {
  /** 计划的总时长（任务预估 + 当天例行） */
  planned: number
  /** 已完成部分的预估时长 */
  done: number
  capacity: number
  count: number
  doneCount: number
}

export function dayLoad(tasks: Task[], day: DayKey, profile: Profile, routineMinutes = 0): DayLoad {
  const planned = tasksPlannedOn(tasks, day)
  const done = planned.filter((task) => task.status === "done")
  return {
    planned: planned.reduce((sum, task) => sum + task.estimateMin, 0) + routineMinutes,
    done: done.reduce((sum, task) => sum + task.estimateMin, 0),
    capacity: capacityFor(day, profile),
    count: planned.length,
    doneCount: done.length,
  }
}

export interface Block {
  taskId: string
  start: number
  end: number
}

export function blockOf(task: Task): Block | null {
  if (!task.startAt) return null
  const start = timeToMinutes(task.startAt)
  return { taskId: task.id, start, end: start + Math.max(MIN_BLOCK, task.estimateMin) }
}

export function blocksFor(tasks: Task[], day: DayKey): Block[] {
  return tasksPlannedOn(tasks, day)
    .map(blockOf)
    .filter((block): block is Block => block !== null)
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

export interface PlacedBlock extends Block {
  lane: number
  lanes: number
}

/** 时间重叠的块并排显示：同一簇里按先后分到不同的列 */
export function layoutBlocks(blocks: Block[]): PlacedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end)
  const placed: PlacedBlock[] = []
  let cluster: PlacedBlock[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length)
    for (const block of cluster) block.lanes = lanes
    placed.push(...cluster)
    cluster = []
    laneEnds = []
  }

  for (const block of sorted) {
    if (cluster.length > 0 && block.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= block.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(block.end)
    } else {
      laneEnds[lane] = block.end
    }
    cluster.push({ ...block, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, block.end)
  }
  flush()
  return placed
}

export function roundUp(minutes: number, step = SLOT_STEP): number {
  return Math.ceil(minutes / step) * step
}

/** 从 from 开始找第一段能放下 duration 分钟、又不和已有块重叠的空档 */
export function findSlot(blocks: Block[], duration: number, from: number, dayEnd: number): number | null {
  let start = roundUp(from)
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  for (const block of sorted) {
    if (block.end <= start) continue
    if (start + duration <= block.start) break
    start = roundUp(Math.max(start, block.end))
  }
  return start + duration <= dayEnd ? start : null
}

/**
 * 一键排进时间线：按给定顺序，把没排时间的任务依次放进「现在之后」的空档。
 * 放不下的留在原处，返回任务 → 开始时间。
 */
export function autoSchedule(
  unscheduled: Task[],
  existing: Block[],
  from: number,
  dayEnd: number
): Map<string, string> {
  const result = new Map<string, string>()
  const blocks = [...existing]
  for (const task of unscheduled) {
    const duration = Math.max(MIN_BLOCK, task.estimateMin)
    const start = findSlot(blocks, duration, from, dayEnd)
    if (start === null) continue
    result.set(task.id, minutesToTime(start))
    blocks.push({ taskId: task.id, start, end: start + duration })
  }
  return result
}

export interface WeekPlacement {
  task: Task
  day: DayKey
  overbooked: boolean
}

export interface WeekNotPlaced {
  task: Task
  reason: string
}

export interface WeekDistribution {
  placed: WeekPlacement[]
  notPlaced: WeekNotPlaced[]
}

/** Distributes tasks in priority order without assigning them to a day before today. */
export function distributeWeek(
  tasks: Task[],
  days: DayKey[],
  remainingMinutes: Readonly<Record<DayKey, number>>,
  today: DayKey
): WeekDistribution {
  const remaining = new Map(days.map((day) => [day, remainingMinutes[day] ?? 0]))
  const availableDays = days.filter((day) => day >= today)
  const ordered = [...tasks].sort((a, b) =>
    (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") ||
    b.priority - a.priority ||
    a.seq - b.seq
  )
  const placed: WeekPlacement[] = []
  const notPlaced: WeekNotPlaced[] = []

  for (const task of ordered) {
    const eligible = task.dueOn
      ? availableDays.filter((day) => day <= task.dueOn!)
      : availableDays
    if (eligible.length === 0) {
      notPlaced.push({ task, reason: task.dueOn
        ? "No day in the selected week is on or before this task's due date."
        : "No future day is available in the selected week." })
      continue
    }

    const fittingDay = eligible.find((day) => (remaining.get(day) ?? 0) >= task.estimateMin)
    if (fittingDay !== undefined) {
      remaining.set(fittingDay, (remaining.get(fittingDay) ?? 0) - task.estimateMin)
      placed.push({ task, day: fittingDay, overbooked: false })
      continue
    }

    if (!task.dueOn) {
      notPlaced.push({ task, reason: "No day in the selected week has enough remaining capacity." })
      continue
    }

    const fallback = [...eligible].sort((a, b) =>
      (remaining.get(b) ?? 0) - (remaining.get(a) ?? 0) || a.localeCompare(b)
    )[0]
    remaining.set(fallback, (remaining.get(fallback) ?? 0) - task.estimateMin)
    placed.push({ task, day: fallback, overbooked: true })
  }

  return { placed, notPlaced }
}
