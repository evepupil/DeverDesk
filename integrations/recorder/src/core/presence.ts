import { AI_ALONE_CAP, PRESENCE_GAP } from "./constants"
import type { EndEvent, EventKind, PromptEvent, RecorderEvent, StopEvent } from "./types"

export type PresenceEvent = PromptEvent | StopEvent | EndEvent

export interface TimeInterval {
  start: number
  end: number
}

export interface EventWindow {
  key: string
  agent: RecorderEvent["agent"]
  session: string
  dir: string
  events: RecorderEvent[]
  presenceEvents: PresenceEvent[]
}

export function windowKey(agent: RecorderEvent["agent"], session: string): string {
  return `${agent}|${session}`
}

export function groupWindows(events: readonly RecorderEvent[]): Map<string, EventWindow> {
  const windows = new Map<string, EventWindow>()
  for (const event of events) {
    if (event.kind === "commit") continue
    const key = windowKey(event.agent, event.session)
    let window = windows.get(key)
    if (!window) {
      window = { key, agent: event.agent, session: event.session, dir: event.dir, events: [], presenceEvents: [] }
      windows.set(key, window)
    }
    window.events.push(event)
    if (event.kind === "prompt" || event.kind === "stop" || event.kind === "end") window.presenceEvents.push(event)
  }
  return windows
}

export function coalesceIntervals(intervals: readonly TimeInterval[]): TimeInterval[] {
  const sorted = intervals.filter(interval => interval.end > interval.start)
    .map(interval => ({ ...interval }))
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: TimeInterval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push(interval)
  }
  return merged
}

/** 按相邻在场证据生成确定计入段；当前最后一个 prompt 的尾巴受 now 限制。 */
export function buildPresenceIntervals(
  windows: ReadonlyMap<string, EventWindow>,
  now: number,
): Map<string, TimeInterval[]> {
  const result = new Map<string, TimeInterval[]>()
  for (const [key, window] of windows) {
    const signals = window.presenceEvents.filter(event => event.t <= now)
    const intervals: TimeInterval[] = []
    for (let index = 0; index < signals.length; index += 1) {
      const current = signals[index]
      const next = signals[index + 1]
      if (!current) continue

      if (current.kind === "prompt") {
        const end = Math.min(current.t + AI_ALONE_CAP, next?.t ?? now, now)
        if (end > current.t) intervals.push({ start: current.t, end })
      } else if (next
        && (next.kind === "prompt" || next.kind === "end")
        && next.t - current.t < PRESENCE_GAP) {
        if (next.t > current.t) intervals.push({ start: current.t, end: next.t })
      }
    }
    result.set(key, coalesceIntervals(intervals))
  }
  return result
}

export function presenceKindOrder(kind: EventKind): number {
  if (kind === "start") return 0
  if (kind === "stop") return 1
  if (kind === "prompt") return 2
  if (kind === "end") return 3
  if (kind === "commit") return 4
  return 5
}
