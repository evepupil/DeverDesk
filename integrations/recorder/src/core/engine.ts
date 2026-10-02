import { AI_ALONE_CAP, PRESENCE_GAP } from "./constants"
import { assignCommits } from "./attribution"
import { allWindowTasks, buildTasksByWindow } from "./arrivals"
import { dedupeAndSort } from "./dedupe"
import { buildPresenceIntervals, coalesceIntervals, groupWindows } from "./presence"
import type { EventWindow, TimeInterval } from "./presence"
import { exactMinutesBetween, splitAndShare } from "./share"
import type { SharedRun } from "./share"
import type { EngineResult, OpenWindow, RecorderEvent } from "./types"

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function currentTail(window: EventWindow, now: number): TimeInterval | undefined {
  const signals = window.presenceEvents.filter(event => event.t <= now)
  const last = signals[signals.length - 1]
  if (!last || last.kind === "prompt") return undefined
  return now - last.t < PRESENCE_GAP && now > last.t ? { start: last.t, end: now } : undefined
}

function isOpen(window: EventWindow, now: number): boolean {
  const signals = window.presenceEvents.filter(event => event.t <= now)
  const last = signals[signals.length - 1]
  if (!last) return false
  if (last.kind === "prompt") return now < last.t + AI_ALONE_CAP
  return now - last.t < PRESENCE_GAP
}

function openWindows(
  windows: ReturnType<typeof groupWindows>,
  confirmed: ReadonlyMap<string, readonly TimeInterval[]>,
  cursors: ReadonlyMap<string, number>,
  now: number,
): OpenWindow[] {
  const activeIntervals = new Map<string, TimeInterval[]>()
  for (const [key, intervals] of confirmed) activeIntervals.set(key, [...intervals])
  for (const [key, window] of windows) {
    if (!isOpen(window, now)) continue
    const tail = currentTail(window, now)
    if (tail) activeIntervals.set(key, coalesceIntervals([...(activeIntervals.get(key) ?? []), tail]))
  }

  const shared = splitAndShare(activeIntervals)
  const open: OpenWindow[] = []
  for (const [key, window] of windows) {
    if (!isOpen(window, now)) continue
    const cursor = cursors.get(key) ?? 0
    const runs: readonly SharedRun[] = shared.get(key) ?? []
    let since: number | undefined
    let exactMinutes = 0
    for (const run of runs) {
      const start = Math.max(cursor, run.start)
      if (run.end <= start) continue
      if (since === undefined) since = start
      exactMinutes += exactMinutesBetween(run, start, run.end)
    }
    if (since === undefined) continue
    open.push({
      session: window.session,
      dir: window.dir,
      agent: window.agent,
      since,
      minutes: Math.floor(exactMinutes + 0.5 + 1e-9),
    })
  }
  return open.sort((a, b) => compareText(a.agent, b.agent) || compareText(a.session, b.session))
}

/** 纯规则引擎：没有文件、网络、git 或时钟依赖，now 始终由调用方传入。 */
export function computeTasks(
  events: readonly RecorderEvent[],
  now: number,
  options?: { clock?: (ms: number) => string },
): EngineResult {
  const ordered = dedupeAndSort(events)
  const windows = groupWindows(ordered)
  const presence = buildPresenceIntervals(windows, now)
  const shared = splitAndShare(presence)
  const commits = ordered.filter((event): event is Extract<RecorderEvent, { kind: "commit" }> =>
    event.kind === "commit"
      && event.t <= now
      && (Number.isFinite(event.seenAt) ? Math.max(event.t, event.seenAt as number) <= now : true))
  const assignments = assignCommits(windows, commits)
  const built = buildTasksByWindow(windows, shared, assignments, commits, now, options?.clock)
  const tasks = allWindowTasks(built.tasks)
  return { tasks, open: openWindows(windows, presence, built.cursors, now) }
}
