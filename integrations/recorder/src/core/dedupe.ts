import { dirNameFromPath } from "./project-name"
import type { EventKind, RecorderEvent } from "./types"

const KIND_ORDER: Record<EventKind, number> = {
  start: 0,
  stop: 1,
  prompt: 2,
  end: 3,
  done: 4,
  commit: 5,
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function commitDirectory(commit: Pick<Extract<RecorderEvent, { kind: "commit" }>, "dir" | "repo">): string {
  if (nonempty(commit.dir)) return commit.dir
  const repo = commit.repo.replace(/[\\/]\.git(?:[\\/])?$/i, "")
  return dirNameFromPath(repo)
}

function validKind(value: unknown): value is EventKind {
  return value === "start" || value === "stop" || value === "prompt"
    || value === "end" || value === "done" || value === "commit"
}

/** Discard malformed log rows and normalize numeric commit weights before any rule runs. */
export function validateEvents(events: readonly RecorderEvent[]): RecorderEvent[] {
  const valid: RecorderEvent[] = []
  for (const value of events as readonly unknown[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const record = value as Record<string, unknown>
    if (!Number.isFinite(record.t) || !nonempty(record.agent) || !nonempty(record.session) || !validKind(record.kind)) continue
    if (record.kind === "commit") {
      if (!nonempty(record.repo) || !nonempty(record.sha) || !nonempty(record.subject)) continue
      const commit = record as unknown as Extract<RecorderEvent, { kind: "commit" }>
      const dir = commitDirectory(commit)
      if (!nonempty(dir)) continue
      valid.push({
        ...record,
        dir,
        additions: Number.isFinite(record.additions) ? record.additions : 0,
        deletions: Number.isFinite(record.deletions) ? record.deletions : 0,
      } as unknown as RecorderEvent)
      continue
    }
    if (!nonempty(record.dir)) continue
    valid.push(record as unknown as RecorderEvent)
  }
  return valid
}

function dedupeKeys(event: RecorderEvent): string[] {
  if (event.kind === "commit") {
    return [
      JSON.stringify(["commit-repo", event.repo, event.sha]),
      JSON.stringify(["commit-directory", commitDirectory(event).toLowerCase(), event.sha]),
    ]
  }
  return [JSON.stringify([event.agent, event.session, event.kind, event.t])]
}

function canonical(event: RecorderEvent): string {
  const record = event as unknown as Record<string, unknown>
  const normalized = Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]))
  return JSON.stringify(normalized) ?? ""
}

/** Deduplicate by stable identity, choosing the lexically smallest serialized row. */
export function dedupeAndSort(events: readonly RecorderEvent[]): RecorderEvent[] {
  const candidates = validateEvents(events).map((event, index) => {
    const identity = dedupeKeys(event)
    return {
      event,
      index,
      identity,
      sortKey: event.kind === "commit"
        ? JSON.stringify(["commit", event.repo, event.sha])
        : identity[0] ?? "",
      value: canonical(event),
    }
  })
  const parents = candidates.map((_, index) => index)
  const owners = new Map<string, number>()

  function findRoot(index: number): number {
    let root = index
    while (parents[root] !== root) root = parents[root] ?? root
    let current = index
    while (parents[current] !== current) {
      const parent = parents[current]
      if (parent === undefined) break
      parents[current] = root
      current = parent
    }
    return root
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (!candidate) continue
    for (const key of candidate.identity) {
      const owner = owners.get(key)
      if (owner !== undefined) {
        const currentRoot = findRoot(index)
        const ownerRoot = findRoot(owner)
        if (currentRoot !== ownerRoot) parents[ownerRoot] = currentRoot
      }
      owners.set(key, index)
    }
  }

  const groups = new Map<number, Array<(typeof candidates)[number]>>()
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (!candidate) continue
    const root = findRoot(index)
    const group = groups.get(root) ?? []
    group.push(candidate)
    groups.set(root, group)
  }

  const unique = [...groups.values()].map(group => group.reduce((best, candidate) =>
    compareText(candidate.value, best.value) < 0
      || (candidate.value === best.value && candidate.index < best.index) ? candidate : best))
  unique.sort((a, b) => a.event.t - b.event.t
    || KIND_ORDER[a.event.kind] - KIND_ORDER[b.event.kind]
    || compareText(a.sortKey, b.sortKey)
    || compareText(a.value, b.value)
    || a.index - b.index)
  return unique.map(({ event }) => event)
}
