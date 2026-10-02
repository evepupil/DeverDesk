import { BURST_GAP, IDLE_ARRIVAL, MERGE_WINDOW, MICRO_TASK, MIN_STANDALONE_TASK, PRESENCE_GAP, SETTLE_DELAY } from "./constants"
import { commitIdentity } from "./attribution"
import type { EventWindow } from "./presence"
import type { SharedRun } from "./share"
import { exactMinutesBetween } from "./share"
import { roundEntries } from "./rounding"
import type { RawEntry, RoundedEntry } from "./rounding"
import { cleanCommitSubject, fallbackTitle, taskSeqFromCommit } from "./titles"
import type { CommitEvent, ComputedTask, DoneEvent, EndEvent, RecorderEvent } from "./types"

interface Arrival {
  source: "commit" | "done" | "idle" | "end"
  t: number
  orderAt: number
  marker: string
  commits?: CommitEvent[]
  event?: DoneEvent | EndEvent
}

interface WindowState {
  window: EventWindow
  runs: readonly SharedRun[]
  runIndex: number
  cursor: number
  tasks: ComputedTask[]
}

const EPSILON = 1e-9

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function effectiveCommitTime(commit: CommitEvent): number {
  return Number.isFinite(commit.seenAt) ? Math.max(commit.t, commit.seenAt as number) : commit.t
}

function motionOrder(event: RecorderEvent): number {
  if (event.kind === "start") return 0
  if (event.kind === "stop") return 1
  if (event.kind === "prompt") return 2
  if (event.kind === "end") return 3
  if (event.kind === "done") return 4
  return 5
}

function markerFor(event: DoneEvent | EndEvent): string {
  return `${event.kind === "done" ? "d" : "e"}:${event.t}`
}

function idleTime(at: number, runs: readonly SharedRun[]): number {
  let end = at
  for (const run of runs) {
    if (run.start <= at) end = Math.max(end, run.end)
    else break
  }
  return end
}

function collectArrivals(
  windows: ReadonlyMap<string, EventWindow>,
  runs: ReadonlyMap<string, readonly SharedRun[]>,
  assignments: ReadonlyMap<string, EventWindow>,
  commits: readonly CommitEvent[],
  now: number,
): Map<string, Arrival[]> {
  const result = new Map<string, Arrival[]>([...windows.keys()].map(key => [key, []]))
  const assignedCommits = new Map<string, CommitEvent[]>()
  for (const event of commits) {
    if (event.t > now || effectiveCommitTime(event) > now) continue
    const owner = assignments.get(commitIdentity(event))
    if (!owner) continue
    const list = assignedCommits.get(owner.key) ?? []
    list.push(event)
    assignedCommits.set(owner.key, list)
  }

  for (const [key, commits] of assignedCommits) {
    commits.sort((a, b) => effectiveCommitTime(a) - effectiveCommitTime(b)
      || a.t - b.t
      || compareText(a.repo, b.repo)
      || compareText(a.sha, b.sha))
    const arrivals = result.get(key)
    if (!arrivals) continue
    let index = 0
    while (index < commits.length) {
      const batch: CommitEvent[] = []
      const first = commits[index]
      if (!first) break
      batch.push(first)
      index += 1
      let previous = first
      while (index < commits.length) {
        const next = commits[index]
        if (!next
          || next.t < previous.t
          || next.t - previous.t >= BURST_GAP
          || effectiveCommitTime(next) - effectiveCommitTime(previous) >= BURST_GAP) break
        batch.push(next)
        previous = next
        index += 1
      }
      const last = batch[batch.length - 1]
      if (last) arrivals.push({
        source: "commit",
        t: last.t,
        orderAt: effectiveCommitTime(last),
        marker: `c:${first.sha}`,
        commits: batch,
      })
    }
  }

  for (const [key, window] of windows) {
    const arrivals = result.get(key)
    const windowRuns = runs.get(key) ?? []
    if (!arrivals) continue

    for (const event of window.events) {
      if (event.t > now) continue
      if (event.kind === "done") arrivals.push({ source: "done", t: event.t, orderAt: event.t, marker: markerFor(event), event })
    }

    const signals = window.presenceEvents.filter(event => event.t <= now)
    for (let index = 0; index < signals.length; index += 1) {
      const event = signals[index]
      if (event?.kind !== "end") continue
      const next = signals[index + 1]
      const confirmed = next
        ? next.t - event.t >= PRESENCE_GAP
        : now - event.t >= PRESENCE_GAP
      if (confirmed) arrivals.push({ source: "end", t: event.t, orderAt: event.t, marker: markerFor(event), event })
    }

    const motions: RecorderEvent[] = [
      ...window.events.filter(event => event.t <= now),
      ...(assignedCommits.get(key) ?? []).filter(event => event.t <= now && effectiveCommitTime(event) <= now),
    ]
    motions.sort((a, b) => a.t - b.t
      || motionOrder(a) - motionOrder(b)
      || (a.kind === "commit" && b.kind === "commit"
        ? compareText(a.repo, b.repo) || compareText(a.sha, b.sha)
        : compareText(a.kind, b.kind)))
    for (let index = 0; index < motions.length; index += 1) {
      const previous = motions[index]
      const next = motions[index + 1]
      if (!previous) continue
      if (next && next.t - previous.t >= IDLE_ARRIVAL) {
        const t = idleTime(previous.t, windowRuns)
        arrivals.push({ source: "idle", t, orderAt: t, marker: `i:${t}` })
      }
      if (!next && now - previous.t >= IDLE_ARRIVAL) {
        const t = idleTime(previous.t, windowRuns)
        arrivals.push({ source: "idle", t, orderAt: t, marker: `i:${t}` })
      }
    }

    arrivals.sort((a, b) => a.orderAt - b.orderAt
      || sourceOrder(a.source) - sourceOrder(b.source)
      || a.t - b.t
      || compareText(a.marker, b.marker))
  }
  return result
}

function sourceOrder(source: Arrival["source"]): number {
  if (source === "commit") return 0
  if (source === "done") return 1
  if (source === "end") return 2
  return 3
}

function entriesBetween(state: WindowState, end: number): RawEntry[] {
  const entries: RawEntry[] = []
  while (state.runIndex < state.runs.length) {
    const run = state.runs[state.runIndex]
    if (!run || run.end > state.cursor) break
    state.runIndex += 1
  }
  for (let index = state.runIndex; index < state.runs.length; index += 1) {
    const run = state.runs[index]
    if (!run || run.start >= end) break
    const start = Math.max(state.cursor, run.start)
    const finish = Math.min(end, run.end)
    if (finish > start) {
      entries.push({ start, end: finish, exactMinutes: exactMinutesBetween(run, start, finish) })
    }
    if (run.end <= end) state.runIndex = index + 1
  }
  return entries
}

function below(value: number, threshold: number): boolean {
  return value + EPSILON < threshold
}

function exactMinutes(entries: readonly RawEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.exactMinutes, 0)
}

function rowWeight(commit: CommitEvent): number {
  return Math.max(1, commit.additions + commit.deletions)
}

function weighted(entries: readonly RawEntry[], weight: number, totalWeight: number): RawEntry[] {
  return entries.map(entry => ({ ...entry, exactMinutes: entry.exactMinutes * weight / totalWeight }))
}

function taskKey(window: EventWindow, marker: string): string {
  return `${window.agent}:${window.session}:${marker}`
}

function mapEntryKeys(entries: readonly RoundedEntry[], key: string, marker: string): ComputedTask["entries"] {
  return entries.map(entry => ({
    key: `${key}#${entry.start}#${marker}`,
    start: entry.start,
    end: entry.end,
    minutes: entry.minutes,
  }))
}

function canMerge(state: WindowState, t: number): ComputedTask | undefined {
  const previous = state.tasks[state.tasks.length - 1]
  if (!previous || t < previous.finishedAt || t - previous.finishedAt > MERGE_WINDOW) return undefined
  return previous
}

function baseTask(
  state: WindowState,
  source: ComputedTask["source"],
  marker: string,
  t: number,
  title: string,
  entries: readonly RoundedEntry[],
  commits: ComputedTask["commits"] = [],
  taskSeq?: number,
): ComputedTask {
  const key = taskKey(state.window, marker)
  return {
    key,
    agent: state.window.agent,
    session: state.window.session,
    dir: state.window.dir,
    source,
    title,
    finishedAt: t,
    commits,
    ...(taskSeq === undefined ? {} : { taskSeq }),
    entries: mapEntryKeys(entries, key, marker),
  }
}

function appendTo(previous: ComputedTask, entries: readonly RoundedEntry[], marker: string, commits: ComputedTask["commits"] = []): void {
  previous.entries.push(...mapEntryKeys(entries, previous.key, marker))
  previous.commits.push(...commits)
}

function processCommitBatch(state: WindowState, arrival: Arrival, raw: readonly RawEntry[]): void {
  const commits = arrival.commits ?? []
  const weights = commits.map(rowWeight)
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]
    const weight = weights[index]
    if (!commit || weight === undefined) continue
    const marker = `c:${commit.sha}`
    const key = taskKey(state.window, marker)
    const allocated = weighted(raw, weight, totalWeight || 1)
    const exact = exactMinutes(allocated)
    const taskSeq = taskSeqFromCommit(commit)
    const previous = taskSeq === undefined && below(exact, MICRO_TASK / 60_000) ? canMerge(state, arrival.t) : undefined
    const rounded = roundEntries(allocated, previous?.key ?? key, marker)
    const taskCommits = [{ sha: commit.sha, subject: commit.subject }]

    if (taskSeq !== undefined) {
      state.tasks.push(baseTask(state, "commit", marker, arrival.t, cleanCommitSubject(commit.subject), rounded.entries, taskCommits, taskSeq))
    } else if (previous) {
      appendTo(previous, rounded.entries, marker, taskCommits)
    } else if (!below(exact, MICRO_TASK / 60_000) || !below(exact, MIN_STANDALONE_TASK / 60_000)) {
      state.tasks.push(baseTask(state, "commit", marker, arrival.t, cleanCommitSubject(commit.subject), rounded.entries, taskCommits))
    }
  }
}

function processArrival(state: WindowState, arrival: Arrival, clock?: (ms: number) => string): void {
  const raw = entriesBetween(state, arrival.t)
  if (arrival.source === "commit") {
    processCommitBatch(state, arrival, raw)
    state.cursor = Math.max(state.cursor, arrival.t)
    return
  }

  const ownKey = taskKey(state.window, arrival.marker)
  const exact = exactMinutes(raw)
  const previous = below(exact, MICRO_TASK / 60_000) ? canMerge(state, arrival.t) : undefined
  const rounded = roundEntries(raw, previous?.key ?? ownKey, arrival.marker)
  if (previous) {
    appendTo(previous, rounded.entries, arrival.marker)
  } else if (arrival.source === "done" || !below(exact, MICRO_TASK / 60_000)) {
    const firstEntry = rounded.entries[0]
    const lastEntry = rounded.entries[rounded.entries.length - 1]
    const title = arrival.event?.kind === "done"
      ? arrival.event.title
      : fallbackTitle(
        state.window.events,
        state.cursor,
        arrival.t,
        clock,
        {
          start: firstEntry?.start ?? raw[0]?.start ?? state.cursor,
          end: lastEntry?.end ?? raw[raw.length - 1]?.end ?? arrival.t,
        },
      )
    state.tasks.push(baseTask(state, arrival.source, arrival.marker, arrival.t, title, rounded.entries))
  }
  state.cursor = Math.max(state.cursor, arrival.t)
}

/** 建立所有到站后再交给引擎做沉淀过滤；这里不看文件、时钟或外部状态。 */
export interface WindowTaskBuild {
  tasks: Map<string, ComputedTask[]>
  cursors: Map<string, number>
}

export function buildTasksByWindow(
  windows: ReadonlyMap<string, EventWindow>,
  runs: ReadonlyMap<string, readonly SharedRun[]>,
  assignments: ReadonlyMap<string, EventWindow>,
  commits: readonly CommitEvent[],
  now: number,
  clock?: (ms: number) => string,
): WindowTaskBuild {
  const arrivals = collectArrivals(windows, runs, assignments, commits, now)
  const tasks = new Map<string, ComputedTask[]>()
  const cursors = new Map<string, number>()
  for (const [key, window] of windows) {
    const windowRuns = runs.get(key) ?? []
    const firstCounted = windowRuns[0]?.start
    const stableArrivals = (arrivals.get(key) ?? []).filter(arrival =>
      arrival.orderAt <= now && arrival.t + SETTLE_DELAY <= now)
    const firstArrival = stableArrivals[0]
    const initialCursor = firstCounted ?? firstArrival?.t ?? 0
    const state: WindowState = { window, runs: windowRuns, runIndex: 0, cursor: initialCursor, tasks: [] }
    for (const arrival of stableArrivals) processArrival(state, arrival, clock)
    tasks.set(key, state.tasks)
    cursors.set(key, state.cursor)
  }
  return { tasks, cursors }
}

export function allWindowTasks(tasks: ReadonlyMap<string, readonly ComputedTask[]>): ComputedTask[] {
  return [...tasks.values()].flatMap(windowTasks => [...windowTasks])
    .sort((a, b) => a.finishedAt - b.finishedAt || compareText(a.key, b.key))
}
