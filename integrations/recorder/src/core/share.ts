import { coalesceIntervals } from "./presence"
import type { TimeInterval } from "./presence"

export interface SharedFragment extends TimeInterval {
  exactMinutes: number
  activeWindows: number
}

export interface SharedRun extends TimeInterval {
  exactMinutes: number
  fragments: SharedFragment[]
}

interface Endpoint {
  t: number
  windowKey: string
  delta: 1 | -1
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 在全体窗口之间按端点切段；同一窗口的相邻小段聚成一个 run。 */
export function splitAndShare(
  source: ReadonlyMap<string, readonly TimeInterval[]>,
): Map<string, SharedRun[]> {
  const intervals = new Map<string, TimeInterval[]>()
  const endpoints: Endpoint[] = []
  for (const [key, raw] of source) {
    const merged = coalesceIntervals(raw)
    intervals.set(key, merged)
    for (const interval of merged) {
      endpoints.push({ t: interval.start, windowKey: key, delta: 1 })
      endpoints.push({ t: interval.end, windowKey: key, delta: -1 })
    }
  }
  const runs = new Map<string, SharedRun[]>([...intervals.keys()].map(key => [key, []]))
  endpoints.sort((a, b) => a.t - b.t || a.delta - b.delta || compareText(a.windowKey, b.windowKey))

  const active = new Set<string>()
  let cursor = endpoints[0]?.t
  let index = 0
  while (index < endpoints.length) {
    const t = endpoints[index]?.t
    if (t === undefined) break
    if (cursor !== undefined && t > cursor && active.size > 0) {
      const duration = t - cursor
      const exactMinutes = duration / 60_000 / active.size
      for (const key of active) {
        const fragment = { start: cursor, end: t, exactMinutes, activeWindows: active.size }
        const windowRuns = runs.get(key)
        if (!windowRuns) continue
        const last = windowRuns[windowRuns.length - 1]
        if (last && last.end === cursor) {
          last.end = t
          last.exactMinutes += exactMinutes
          last.fragments.push(fragment)
        } else {
          windowRuns.push({ start: cursor, end: t, exactMinutes, fragments: [fragment] })
        }
      }
    }

    while (index < endpoints.length && endpoints[index]?.t === t) {
      const endpoint = endpoints[index]
      if (endpoint) {
        if (endpoint.delta < 0) active.delete(endpoint.windowKey)
        else active.add(endpoint.windowKey)
      }
      index += 1
    }
    cursor = t
  }
  return runs
}

export function exactMinutesBetween(run: SharedRun, start: number, end: number): number {
  let low = 0
  let high = run.fragments.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const fragment = run.fragments[middle]
    if (fragment && fragment.end <= start) low = middle + 1
    else high = middle
  }

  let minutes = 0
  for (let index = low; index < run.fragments.length; index += 1) {
    const fragment = run.fragments[index]
    if (!fragment || fragment.start >= end) break
    const from = Math.max(start, fragment.start)
    const to = Math.min(end, fragment.end)
    if (to > from) minutes += (to - from) / 60_000 / fragment.activeWindows
  }
  return minutes
}
