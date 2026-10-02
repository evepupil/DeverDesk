import { PRESENCE_GAP } from "./constants"
import { commitDirectory } from "./dedupe"
import type { CommitEvent } from "./types"
import type { EventWindow, PresenceEvent } from "./presence"

export function commitIdentity(commit: Pick<CommitEvent, "dir" | "repo" | "sha">): string {
  return JSON.stringify([commitDirectory(commit).toLowerCase(), commit.sha])
}

function lastBefore(events: readonly PresenceEvent[], t: number): PresenceEvent | undefined {
  let low = 0
  let high = events.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const event = events[middle]
    if (event && event.t < t) low = middle + 1
    else high = middle
  }
  return events[low - 1]
}

function sessionBefore(a: EventWindow, b: EventWindow): number {
  if (a.session !== b.session) return a.session < b.session ? -1 : 1
  if (a.agent !== b.agent) return a.agent < b.agent ? -1 : 1
  return 0
}

/** 按提交时间和固定目录名归属，不使用钩子发现提交时填入的 session。 */
export function assignCommits(
  windows: ReadonlyMap<string, EventWindow>,
  commits: readonly CommitEvent[],
): Map<string, EventWindow> {
  const assigned = new Map<string, EventWindow>()
  for (const commit of commits) {
    const candidates = [...windows.values()]
      .filter(window => window.dir.toLowerCase() === commit.dir.toLowerCase())
      .map(window => ({ window, last: lastBefore(window.presenceEvents, commit.t) }))
      .filter((candidate): candidate is { window: EventWindow; last: PresenceEvent } => candidate.last !== undefined)

    const prompts = candidates.filter(candidate => candidate.last.kind === "prompt")
    prompts.sort((a, b) => b.last.t - a.last.t || sessionBefore(a.window, b.window))
    if (prompts[0]) {
      assigned.set(commitIdentity(commit), prompts[0].window)
      continue
    }

    const recent = candidates.filter(candidate => commit.t - candidate.last.t < PRESENCE_GAP)
    recent.sort((a, b) => b.last.t - a.last.t || sessionBefore(a.window, b.window))
    if (recent[0]) assigned.set(commitIdentity(commit), recent[0].window)
  }
  return assigned
}
