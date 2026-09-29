/**
 * 列表记录按 id 比较，周回顾按 week 比较；列表数组引用没变就跳过。
 * 单例按引用比较，timer 设为 null 表示删除。合并时保留未变列表和记录的引用，
 * 已有记录原位替换，新记录追加，null 删除；profile 不接受删除，timer 接受删除。
 */
import { SINGLETON_ID, type ListKind, type RecordKind } from "@/sync/protocol"
import type { WorkbenchData } from "@/domain/types"

export interface DataChange {
  kind: RecordKind
  id: string
  data: unknown | null
}

export function recordKey(kind: RecordKind, id: string): string {
  return `${kind}:${id}`
}

function diffList<T>(
  kind: ListKind,
  previous: readonly T[],
  next: readonly T[],
  idOf: (item: T) => string
): DataChange[] {
  if (previous === next) return []

  const previousById = new Map(previous.map((item) => [idOf(item), item]))
  const nextIds = new Set<string>()
  const changes: DataChange[] = []

  for (const item of next) {
    const id = idOf(item)
    nextIds.add(id)
    if (previousById.get(id) !== item) changes.push({ kind, id, data: item })
  }
  for (const item of previous) {
    const id = idOf(item)
    if (!nextIds.has(id)) changes.push({ kind, id, data: null })
  }
  return changes
}

export function diffData(prev: WorkbenchData, next: WorkbenchData): DataChange[] {
  const changes: DataChange[] = []
  changes.push(...diffList("project", prev.projects, next.projects, (item) => item.id))
  changes.push(...diffList("task", prev.tasks, next.tasks, (item) => item.id))
  changes.push(...diffList("entry", prev.entries, next.entries, (item) => item.id))
  changes.push(...diffList("ledger", prev.ledger, next.ledger, (item) => item.id))
  changes.push(...diffList("routine", prev.routines, next.routines, (item) => item.id))
  changes.push(...diffList("note", prev.notes, next.notes, (item) => item.week))
  if (prev.profile !== next.profile) changes.push({ kind: "profile", id: SINGLETON_ID, data: next.profile })
  if (prev.timer !== next.timer) changes.push({ kind: "timer", id: SINGLETON_ID, data: next.timer })
  return changes
}

function applyList<T>(list: T[], id: string, value: T | null, idOf: (item: T) => string): T[] {
  const index = list.findIndex((item) => idOf(item) === id)
  if (value === null) return index < 0 ? list : list.filter((_, itemIndex) => itemIndex !== index)
  if (index < 0) return [...list, value]
  if (list[index] === value) return list
  return list.map((item, itemIndex) => (itemIndex === index ? value : item))
}

export function applyRecords(data: WorkbenchData, records: DataChange[]): WorkbenchData {
  let projects = data.projects
  let tasks = data.tasks
  let entries = data.entries
  let ledger = data.ledger
  let routines = data.routines
  let notes = data.notes
  let profile = data.profile
  let timer = data.timer

  for (const record of records) {
    switch (record.kind) {
      case "project":
        projects = applyList(projects, record.id, record.data as WorkbenchData["projects"][number] | null, (item) => item.id)
        break
      case "task":
        tasks = applyList(tasks, record.id, record.data as WorkbenchData["tasks"][number] | null, (item) => item.id)
        break
      case "entry":
        entries = applyList(entries, record.id, record.data as WorkbenchData["entries"][number] | null, (item) => item.id)
        break
      case "ledger":
        ledger = applyList(ledger, record.id, record.data as WorkbenchData["ledger"][number] | null, (item) => item.id)
        break
      case "routine":
        routines = applyList(routines, record.id, record.data as WorkbenchData["routines"][number] | null, (item) => item.id)
        break
      case "note":
        notes = applyList(notes, record.id, record.data as WorkbenchData["notes"][number] | null, (item) => item.week)
        break
      case "profile":
        if (record.data !== null) profile = record.data as WorkbenchData["profile"]
        break
      case "timer":
        timer = record.data as WorkbenchData["timer"]
        break
    }
  }

  return { ...data, projects, tasks, entries, ledger, routines, notes, profile, timer }
}
