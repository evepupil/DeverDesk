import type { DayKey, EntryKind, LedgerEntry } from "./types"

/** 收支计算：只有已到账（支出为已支付）的记录算进收入和支出 */

export interface Totals {
  income: number
  expense: number
  net: number
}

function within(entry: LedgerEntry, start: DayKey, end: DayKey) {
  return entry.date >= start && entry.date <= end
}

export function totals(entries: LedgerEntry[], start: DayKey, end: DayKey, projectId?: string | null): Totals {
  let income = 0
  let expense = 0
  for (const entry of entries) {
    if (entry.status !== "received" || !within(entry, start, end)) continue
    if (projectId !== undefined && entry.projectId !== projectId) continue
    if (entry.kind === "income") income += entry.amount
    else expense += entry.amount
  }
  return { income, expense, net: income - expense }
}

/** 待到账的收入，按预计到账日排序 */
export function pendingIncome(entries: LedgerEntry[]): LedgerEntry[] {
  return entries
    .filter((entry) => entry.kind === "income" && entry.status === "pending")
    .sort((a, b) => (a.expectedOn ?? a.date).localeCompare(b.expectedOn ?? b.date))
}

/** 过了预计到账日还没到的钱 */
export function overduePending(entries: LedgerEntry[], today: DayKey): LedgerEntry[] {
  return pendingIncome(entries).filter((entry) => (entry.expectedOn ?? entry.date) < today)
}

export interface ProjectMoney extends Totals {
  projectId: string | null
}

export function byProject(entries: LedgerEntry[], start: DayKey, end: DayKey): ProjectMoney[] {
  const map = new Map<string | null, ProjectMoney>()
  for (const entry of entries) {
    if (entry.status !== "received" || !within(entry, start, end)) continue
    const row = map.get(entry.projectId) ?? { projectId: entry.projectId, income: 0, expense: 0, net: 0 }
    if (entry.kind === "income") row.income += entry.amount
    else row.expense += entry.amount
    row.net = row.income - row.expense
    map.set(entry.projectId, row)
  }
  return [...map.values()].sort((a, b) => b.net - a.net)
}

export function byCategory(entries: LedgerEntry[], kind: EntryKind, start: DayKey, end: DayKey) {
  const map = new Map<string, number>()
  for (const entry of entries) {
    if (entry.kind !== kind || entry.status !== "received" || !within(entry, start, end)) continue
    map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount)
  }
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
}

export const LEDGER_FILTER_KEYS = ["kind", "project", "channel", "category", "status"] as const
export type LedgerFilterKey = (typeof LEDGER_FILTER_KEYS)[number]
export type LedgerFilters = Partial<Record<LedgerFilterKey, string[]>>

export function matchEntry(entry: LedgerEntry, filters: LedgerFilters, skip?: LedgerFilterKey): boolean {
  const has = (key: LedgerFilterKey) => skip !== key && (filters[key]?.length ?? 0) > 0
  if (has("kind") && !filters.kind?.includes(entry.kind)) return false
  if (has("project") && !filters.project?.includes(entry.projectId ?? "none")) return false
  if (has("channel") && !filters.channel?.includes(entry.channel)) return false
  if (has("category") && !filters.category?.includes(entry.category)) return false
  if (has("status") && !filters.status?.includes(entry.status)) return false
  return true
}

/** 金额校验：必须是大于 0、最多两位小数的数字 */
export function parseAmount(raw: string): number | null {
  const text = raw.trim().replace(/[,，¥\s]/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const value = Number(text)
  return value > 0 ? value : null
}
