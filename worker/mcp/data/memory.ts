import type { DayKey, WorkbenchData } from "../../../src/domain/types"
import { minutesOf, sortTasks } from "../../../src/domain/tasks"
import { SINGLETON_ID, type RecordKind } from "../../../src/sync/protocol"
import type {
  DataSource,
  EntryQuery,
  LedgerQuery,
  RecordVersion,
  TaskQuery,
  Versioned,
} from "../types"
import {
  applyLimit,
  compareEntries,
  compareIds,
  compareLedger,
  compareTasks,
  containsText,
  copyVersioned,
  type StoredRecord,
} from "./rows"
import { hasRecordShape } from "./validate"

export interface MemoryDataSourceOptions {
  /** 记录的修改时间和写入顺序号，键为「种类:编号」；没给的修改时间按 1、写入顺序号按记录在数据里的先后从 1 起 */
  versions?: Record<string, { updatedAt: number; rev: number }>
  /** 已删除的记录（只用于 record()、profile()、timer() 查现状） */
  deleted?: { kind: string; id: string; updatedAt: number; rev: number }[]
}

interface PendingRecord {
  kind: RecordKind
  id: string
  value: unknown
}

function recordKey(kind: string, id: string): string {
  return `${kind}:${id}`
}

export function createMemoryDataSource(data: WorkbenchData, options: MemoryDataSourceOptions = {}): DataSource {
  const pending: PendingRecord[] = [
    ...data.projects.map((value) => ({ kind: "project" as const, id: value.id, value })),
    ...data.tasks.map((value) => ({ kind: "task" as const, id: value.id, value })),
    ...data.entries.map((value) => ({ kind: "entry" as const, id: value.id, value })),
    ...data.ledger.map((value) => ({ kind: "ledger" as const, id: value.id, value })),
    ...data.routines.map((value) => ({ kind: "routine" as const, id: value.id, value })),
    ...data.notes.map((value) => ({ kind: "note" as const, id: value.week, value })),
    { kind: "profile", id: SINGLETON_ID, value: data.profile },
    ...(data.timer === null ? [] : [{ kind: "timer" as const, id: SINGLETON_ID, value: data.timer }]),
  ]
  const versions = options.versions ?? {}
  const deleted = new Map((options.deleted ?? []).map((item) => [recordKey(item.kind, item.id), item]))
  const usedRevs = new Set<number>([
    ...Object.values(versions).map((version) => version.rev),
    ...(options.deleted ?? []).map((item) => item.rev),
  ])
  const live = new Map<string, StoredRecord<unknown>>()
  let nextRev = 1

  for (const item of pending) {
    const key = recordKey(item.kind, item.id)
    const version = versions[key]
    let rev = version?.rev
    if (rev === undefined) {
      while (usedRevs.has(nextRev)) nextRev += 1
      rev = nextRev
      usedRevs.add(rev)
      nextRev += 1
    }
    live.set(key, { id: item.id, value: item.value, updatedAt: version?.updatedAt ?? 1, rev })
  }

  function list<T>(kind: RecordKind): StoredRecord<T>[] {
    const records: StoredRecord<T>[] = []
    for (const item of pending) {
      const key = recordKey(item.kind, item.id)
      if (item.kind !== kind || deleted.has(key)) continue
      if (!hasRecordShape(kind, item.value)) {
        console.warn("Skipping MCP memory record with invalid data shape", item.id)
        continue
      }
      records.push(live.get(key) as StoredRecord<T>)
    }
    return records
  }

  function singleton<T>(kind: "profile" | "timer"): { value: T | null; updatedAt: number | null; rev: number | null } {
    const key = recordKey(kind, SINGLETON_ID)
    const tombstone = deleted.get(key)
    if (tombstone) return { value: null, updatedAt: tombstone.updatedAt, rev: tombstone.rev }
    const record = live.get(key)
    if (record) {
      if (!hasRecordShape(kind, record.value)) {
        console.warn("Skipping MCP memory record with invalid data shape", record.id)
        return { value: null, updatedAt: record.updatedAt, rev: record.rev }
      }
      return { value: structuredClone(record.value) as T, updatedAt: record.updatedAt, rev: record.rev }
    }
    return { value: null, updatedAt: versions[key]?.updatedAt ?? null, rev: versions[key]?.rev ?? null }
  }

  function versioned<T>(item: StoredRecord<T>): Versioned<T> {
    return copyVersioned(item)
  }

  function queryList<T>(kind: RecordKind): StoredRecord<T>[] {
    return list<T>(kind)
  }

  function queryTasks(query: TaskQuery): Promise<Versioned<WorkbenchData["tasks"][number]>[]> {
    const matches = queryList<WorkbenchData["tasks"][number]>("task").filter(({ id, value }) =>
      (query.ids === undefined || query.ids.includes(id)) &&
      (query.seqs === undefined || query.seqs.includes(value.seq)) &&
      (query.statuses === undefined || query.statuses.includes(value.status)) &&
      (query.plannedFrom === undefined || (value.plannedFor !== null && value.plannedFor >= query.plannedFrom)) &&
      (query.plannedTo === undefined || (value.plannedFor !== null && value.plannedFor <= query.plannedTo)) &&
      (query.unplanned !== true || value.plannedFor === null) &&
      (query.dueFrom === undefined || (value.dueOn !== null && value.dueOn >= query.dueFrom)) &&
      (query.dueTo === undefined || (value.dueOn !== null && value.dueOn <= query.dueTo)) &&
      (query.completedFrom === undefined || (value.completedAt !== null && value.completedAt >= query.completedFrom)) &&
      (query.completedTo === undefined || (value.completedAt !== null && value.completedAt < query.completedTo)) &&
      (query.projectId === undefined || value.projectId === query.projectId) &&
      (query.text === undefined || containsText(value.title, query.text))
    )
    const sorted = query.orderBy === undefined
      ? matches.sort((a, b) => compareTasks(a.value, b.value))
      : (() => {
        const byId = new Map(matches.map((item) => [item.id, item]))
        return sortTasks(matches.map((item) => item.value), query.orderBy!).map((task) => byId.get(task.id)!)
      })()
    return Promise.resolve(applyLimit(sorted, query.limit).map(versioned))
  }

  async function countTasksByProject(query: TaskQuery): Promise<Map<string | null, number>> {
    const result = new Map<string | null, number>()
    for (const { value } of await queryTasks(query)) {
      result.set(value.projectId, (result.get(value.projectId) ?? 0) + 1)
    }
    return result
  }

  function queryEntries(query: EntryQuery): Promise<Versioned<WorkbenchData["entries"][number]>[]> {
    const matches = queryList<WorkbenchData["entries"][number]>("entry").filter(({ id, value }) =>
      (query.ids === undefined || query.ids.includes(id)) &&
      (query.from === undefined || value.start >= query.from) &&
      (query.to === undefined || value.start < query.to) &&
      (query.projectId === undefined || value.projectId === query.projectId) &&
      (query.taskIds === undefined || (value.taskId !== null && query.taskIds.includes(value.taskId)))
    )
    return Promise.resolve(applyLimit(matches.sort((a, b) => compareEntries(a.value, b.value)), query.limit).map(versioned))
  }

  async function sumEntryMinutesByTask(taskIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    if (taskIds.length === 0) return result
    for (const { value } of await queryEntries({ taskIds })) {
      if (value.taskId === null) continue
      result.set(value.taskId, (result.get(value.taskId) ?? 0) + minutesOf(value))
    }
    return result
  }

  return {
    async profile() {
      return singleton("profile")
    },
    async timer() {
      return singleton("timer")
    },
    async projects() {
      return queryList<WorkbenchData["projects"][number]>("project")
        .sort((a, b) => a.rev - b.rev || compareIds(a.id, b.id))
        .map(versioned)
    },
    async routines() {
      return queryList<WorkbenchData["routines"][number]>("routine")
        .sort((a, b) => a.rev - b.rev || compareIds(a.id, b.id))
        .map(versioned)
    },
    async notes(weeks?: DayKey[]) {
      return queryList<WorkbenchData["notes"][number]>("note")
        .filter((item) => weeks === undefined || weeks.includes(item.id))
        .sort((a, b) => a.rev - b.rev || compareIds(a.id, b.id))
        .map(versioned)
    },
    tasks: queryTasks,
    countTasksByProject,
    entries: queryEntries,
    sumEntryMinutesByTask,
    async ledger(query: LedgerQuery) {
      const matches = queryList<WorkbenchData["ledger"][number]>("ledger").filter(({ id, value }) =>
        (query.ids === undefined || query.ids.includes(id)) &&
        (query.from === undefined || value.date >= query.from) &&
        (query.to === undefined || value.date <= query.to) &&
        (query.statuses === undefined || query.statuses.includes(value.status)) &&
        (query.kinds === undefined || query.kinds.includes(value.kind)) &&
        (query.projectId === undefined || value.projectId === query.projectId) &&
        (query.externalIds === undefined || (value.externalId !== undefined && query.externalIds.includes(value.externalId))) &&
        (query.text === undefined || containsText(value.note, query.text))
      )
      return applyLimit(matches.sort((a, b) => compareLedger(a.value, b.value)), query.limit).map(versioned)
    },
    async record(kind: RecordKind, id: string): Promise<RecordVersion | null> {
      const key = recordKey(kind, id)
      const tombstone = deleted.get(key)
      if (tombstone) return { value: null, updatedAt: tombstone.updatedAt, rev: tombstone.rev, deleted: true }
      const record = live.get(key)
      if (record) {
        if (!hasRecordShape(kind, record.value)) {
          console.warn("Skipping MCP memory record with invalid data shape", record.id)
          return { value: null, updatedAt: record.updatedAt, rev: record.rev, deleted: false }
        }
        return {
          value: structuredClone(record.value),
          updatedAt: record.updatedAt,
          rev: record.rev,
          deleted: false,
        }
      }
      if (kind === "timer") {
        const version = versions[key]
        if (version) return { value: null, updatedAt: version.updatedAt, rev: version.rev, deleted: true }
      }
      return null
    },
  }
}
