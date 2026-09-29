import { addDays, addMonths, isWeekend, isWithin, monthEnd, monthStart, weekStart } from "./calendar"
import type { DayKey, Routine } from "./types"

/** 例行事务：某天该不该做、做没做、连续了多少期 */

export function isDueOn(routine: Routine, day: DayKey): boolean {
  if (routine.archived || day < routine.createdOn) return false
  if (routine.cadence === "weekdays") return !isWeekend(day)
  return true
}

export function periodOf(routine: Routine, day: DayKey): { start: DayKey; end: DayKey } {
  switch (routine.cadence) {
    case "daily":
    case "weekdays":
      return { start: day, end: day }
    case "weekly": {
      const start = weekStart(day)
      return { start, end: addDays(start, 6) }
    }
    case "monthly":
      return { start: monthStart(day), end: monthEnd(day) }
  }
}

export function isDone(routine: Routine, day: DayKey): boolean {
  const { start, end } = periodOf(routine, day)
  return routine.doneOn.some((done) => isWithin(done, start, end))
}

/** 勾选或取消：本期做过就清掉本期的记录，没做过就记在这一天 */
export function toggleDone(routine: Routine, day: DayKey): Routine {
  const { start, end } = periodOf(routine, day)
  const doneInPeriod = routine.doneOn.some((done) => isWithin(done, start, end))
  return {
    ...routine,
    doneOn: doneInPeriod
      ? routine.doneOn.filter((done) => !isWithin(done, start, end))
      : [...routine.doneOn, day].sort(),
  }
}

function previousPeriodDay(routine: Routine, day: DayKey): DayKey {
  switch (routine.cadence) {
    case "daily":
      return addDays(day, -1)
    case "weekdays": {
      let prev = addDays(day, -1)
      while (isWeekend(prev)) prev = addDays(prev, -1)
      return prev
    }
    case "weekly":
      return addDays(weekStart(day), -1)
    case "monthly":
      return addDays(monthStart(day), -1)
  }
}

/** 连续完成了多少期；本期还没做不算断，从上一期往回数 */
export function streak(routine: Routine, today: DayKey): number {
  let day = today
  if (routine.cadence === "weekdays" && isWeekend(day)) day = previousPeriodDay(routine, day)
  if (!isDone(routine, day)) day = previousPeriodDay(routine, day)
  let count = 0
  while (day >= routine.createdOn && isDone(routine, day)) {
    count++
    day = previousPeriodDay(routine, day)
  }
  return count
}

export interface HeatCell {
  key: DayKey
  done: boolean
  due: boolean
  future: boolean
}

/** 打卡格子：按天的画近 12 周，按周的画近 16 周，按月的画近 12 个月 */
export function heatCells(routine: Routine, today: DayKey): HeatCell[] {
  if (routine.cadence === "weekly") {
    const current = weekStart(today)
    return Array.from({ length: 16 }, (_, i) => {
      const key = addDays(current, (i - 15) * 7)
      return { key, done: isDone(routine, key), due: key >= weekStart(routine.createdOn), future: false }
    })
  }
  if (routine.cadence === "monthly") {
    return Array.from({ length: 12 }, (_, i) => {
      const key = addMonths(today, i - 11)
      return { key, done: isDone(routine, key), due: key >= monthStart(routine.createdOn), future: false }
    })
  }
  const end = addDays(weekStart(today), 6)
  const start = addDays(end, -83)
  return Array.from({ length: 84 }, (_, i) => {
    const key = addDays(start, i)
    return { key, done: isDone(routine, key), due: isDueOn(routine, key), future: key > today }
  })
}

/**
 * 某天例行事务要占的时间，算进当天的已排时长。
 * 每天、工作日的按当天算；每周、每月的不固定哪天做，只在做了的那天算。
 */
export function routineMinutesOn(routines: Routine[], day: DayKey): number {
  let sum = 0
  for (const routine of routines) {
    if (!isDueOn(routine, day)) continue
    const fixed = routine.cadence === "daily" || routine.cadence === "weekdays"
    if (fixed || routine.doneOn.includes(day)) sum += routine.estimateMin
  }
  return sum
}

/** 一段时间里该做的期数中做了几期 */
export function completionRate(routine: Routine, start: DayKey, end: DayKey): { done: number; due: number } {
  let done = 0
  let due = 0
  const seen = new Set<string>()
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (!isDueOn(routine, day)) continue
    const period = periodOf(routine, day)
    const key = period.start
    if (seen.has(key)) continue
    seen.add(key)
    due++
    if (isDone(routine, day)) done++
  }
  return { done, due }
}
