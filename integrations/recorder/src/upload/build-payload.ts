import { createHash } from "node:crypto"
import {
  UPLOAD_MAX_CHANGES,
  UPLOAD_MAX_COMMITS_PER_TASK,
  UPLOAD_MAX_ENTRIES_PER_TASK,
  UPLOAD_MAX_TASKS,
  UPLOAD_TITLE_MAX,
  type UploadRequest,
  type UploadTask,
} from "../../../../src/sync/recorder-protocol"
import type { Agent, ComputedEntry, ComputedTask } from "../core/types"

export interface UploadClientInfo {
  name: string
  version: string
  agent: Agent
}

interface CompressibleEntry {
  entry: ComputedEntry
  originalKeys: string[]
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}

export function compactUploadKey(value: string, maxLength = 200): string {
  if (value.length <= maxLength) return value
  const suffix = `~${digest(value)}`
  return `${truncateText(value, maxLength - suffix.length)}${suffix}`
}

function truncateText(value: string, maxLength: number): string {
  let result = ""
  for (const character of value) {
    if (result.length + character.length > maxLength) break
    result += character
  }
  return result
}

function compressEntries(entries: readonly ComputedEntry[], uploaded: ReadonlySet<string>): ComputedEntry[] {
  const compressed: CompressibleEntry[] = entries
    .filter((entry) => !uploaded.has(entry.key))
    .map((entry) => ({ entry: { ...entry }, originalKeys: [entry.key] }))
    .sort((left, right) => left.entry.start - right.entry.start || left.entry.end - right.entry.end || left.entry.key.localeCompare(right.entry.key))
  while (compressed.length > UPLOAD_MAX_ENTRIES_PER_TASK) {
    let nearest = 0
    let nearestGap = Number.POSITIVE_INFINITY
    for (let index = 0; index < compressed.length - 1; index += 1) {
      const current = compressed[index]?.entry
      const next = compressed[index + 1]?.entry
      if (!current || !next) continue
      const gap = next.start - current.end
      if (gap < nearestGap) {
        nearestGap = gap
        nearest = index
      }
    }
    const left = compressed[nearest]
    const right = compressed[nearest + 1]
    if (!left || !right) break
    const originalKeys = [...left.originalKeys, ...right.originalKeys]
    compressed.splice(nearest, 2, {
      originalKeys,
      entry: {
        key: `${truncateText(originalKeys[0] ?? "", 150)}+${originalKeys.length}~${createHash("sha256").update(originalKeys.join("")).digest("hex").slice(0, 8)}`,
        start: Math.min(left.entry.start, right.entry.start),
        end: Math.max(left.entry.end, right.entry.end),
        minutes: left.entry.minutes + right.entry.minutes,
      },
    })
  }
  return compressed.map(({ entry }) => ({ ...entry, key: compactUploadKey(entry.key) }))
}

function toUploadTask(task: ComputedTask, uploaded: ReadonlySet<string>): UploadTask {
  const trimmedTitle = task.title.trim()
  const title = truncateText(trimmedTitle || "Coding", UPLOAD_TITLE_MAX)
  const taskSeq = task.taskSeq !== undefined && Number.isInteger(task.taskSeq) && task.taskSeq >= 1 && task.taskSeq <= 999_999
    ? task.taskSeq
    : undefined
  return {
    key: compactUploadKey(task.key),
    dir: truncateText(task.dir.trim(), 60),
    title: title || "Coding",
    source: task.source,
    finishedAt: task.finishedAt,
    commits: task.commits
      .slice(0, UPLOAD_MAX_COMMITS_PER_TASK)
      .filter((commit) => /^[\da-f]{7,64}$/iu.test(commit.sha))
      .map((commit) => ({ sha: commit.sha, subject: truncateText(commit.subject, 200) })),
    ...(taskSeq === undefined ? {} : { taskSeq }),
    entries: compressEntries(task.entries, uploaded),
  }
}

function changeCount(tasks: readonly UploadTask[]): number {
  return tasks.length + tasks.reduce((sum, task) => sum + task.entries.length, 0)
}

export function buildUploadRequests(tasks: ComputedTask[], client: UploadClientInfo, uploaded: ReadonlySet<string> = new Set()): UploadRequest[] {
  const byAgent = new Map<Agent, ComputedTask[]>()
  for (const task of tasks) {
    const group = byAgent.get(task.agent) ?? []
    group.push(task)
    byAgent.set(task.agent, group)
  }

  const requests: UploadRequest[] = []
  for (const [agent, group] of byAgent) {
    let batch: UploadTask[] = []
    const flush = () => {
      if (batch.length === 0) return
      requests.push({
        client: { name: client.name, version: client.version, agent },
        tasks: batch,
      })
      batch = []
    }

    for (const task of group) {
      const payload = toUploadTask(task, uploaded)
      const proposed = [...batch, payload]
      if (batch.length > 0 && (proposed.length > UPLOAD_MAX_TASKS || changeCount(proposed) > UPLOAD_MAX_CHANGES)) flush()
      batch.push(payload)
    }
    flush()
  }
  return requests
}
