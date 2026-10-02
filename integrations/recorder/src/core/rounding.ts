import { MIN_ENTRY } from "./constants"

const EPSILON = 1e-9

export interface RawEntry {
  start: number
  end: number
  exactMinutes: number
}

export interface RoundedEntry extends RawEntry {
  key: string
  minutes: number
}

export interface RoundedEntries {
  entries: RoundedEntry[]
  minutes: number
  exactMinutes: number
}

/** 先过滤短段，再用最大余数法分配总分钟，保证段分钟之和等于任务分钟。 */
export function roundEntries(
  rawEntries: readonly RawEntry[],
  taskKey: string,
  sourceMarker: string,
): RoundedEntries {
  const kept = rawEntries
    .map((entry, index) => ({ ...entry, index }))
    .filter(entry => entry.exactMinutes + EPSILON >= MIN_ENTRY / 60_000)
  const exactMinutes = kept.reduce((sum, entry) => sum + entry.exactMinutes, 0)
  const totalMinutes = Math.floor(exactMinutes + 0.5 + EPSILON)
  const allocations = kept.map(entry => ({
    ...entry,
    minutes: Math.floor(entry.exactMinutes),
    fraction: entry.exactMinutes - Math.floor(entry.exactMinutes),
  }))
  let remainder = totalMinutes - allocations.reduce((sum, entry) => sum + entry.minutes, 0)
  const remainderOrder = [...allocations].sort((a, b) => {
    const difference = b.fraction - a.fraction
    if (Math.abs(difference) > EPSILON) return difference
    return a.start - b.start || a.index - b.index
  })
  for (const entry of remainderOrder) {
    if (remainder <= 0) break
    entry.minutes += 1
    remainder -= 1
  }

  const entries = allocations
    .filter(entry => entry.minutes > 0)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index)
    .map(entry => ({
      key: `${taskKey}#${entry.start}#${sourceMarker}`,
      start: entry.start,
      end: entry.end,
      minutes: entry.minutes,
      exactMinutes: entry.exactMinutes,
    }))
  return { entries, minutes: entries.reduce((sum, entry) => sum + entry.minutes, 0), exactMinutes }
}
