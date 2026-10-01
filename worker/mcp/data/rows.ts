import type { LedgerEntry, Task, TimeEntry } from "../../../src/domain/types"

export interface StoredRecord<T> {
  id: string
  value: T
  updatedAt: number
  rev: number
}

export function normalizeSearchText(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

export function containsText(value: string, text: string): boolean {
  return normalizeSearchText(value).includes(normalizeSearchText(text))
}

export function normalizeLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined
  if (!Number.isFinite(limit)) return 0
  return Math.max(0, Math.floor(limit))
}

export function copyVersioned<T>(record: StoredRecord<T>): { value: T; updatedAt: number; rev: number } {
  return {
    value: structuredClone(record.value),
    updatedAt: record.updatedAt,
    rev: record.rev,
  }
}

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function compareTasks(a: Task, b: Task): number {
  return a.seq - b.seq || compareIds(a.id, b.id)
}

export function compareEntries(a: TimeEntry, b: TimeEntry): number {
  return a.start - b.start || compareIds(a.id, b.id)
}

export function compareLedger(a: LedgerEntry, b: LedgerEntry): number {
  return a.date.localeCompare(b.date) || a.createdAt - b.createdAt || compareIds(a.id, b.id)
}

export function applyLimit<T>(items: T[], limit: number | undefined): T[] {
  const normalized = normalizeLimit(limit)
  return normalized === undefined ? items : items.slice(0, normalized)
}
