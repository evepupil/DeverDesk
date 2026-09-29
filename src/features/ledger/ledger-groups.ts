import { categoryLabel } from "@/data/catalog"
import { formatMonthLabel, monthKeyOf } from "@/domain/calendar"
import { getT } from "@/i18n/runtime"
import type { LedgerEntry, Project } from "@/domain/types"
import type { LedgerGroupBy } from "@/state/prefs"

export interface LedgerGroup {
  key: string
  label: string
  items: LedgerEntry[]
  /** 已到账的收入、已支付的支出；待到账和已退款不计 */
  income: number
  expense: number
  net: number
  /** 这一组还在路上的钱（只有待到账一组有） */
  pending: number
  collapsed: boolean
  projectId?: string | null
}

/** 分组方式的选项；名字按当前语言从词条现取 */
export function ledgerGroupOptions(): { value: LedgerGroupBy; label: string }[] {
  const t = getT().ledger.group
  return [
    { value: "month", label: t.month },
    { value: "project", label: t.project },
    { value: "category", label: t.category },
  ]
}

function sums(items: LedgerEntry[]) {
  let income = 0
  let expense = 0
  let pending = 0
  for (const entry of items) {
    if (entry.status === "pending") pending += entry.amount
    if (entry.status !== "received") continue
    if (entry.kind === "income") income += entry.amount
    else expense += entry.amount
  }
  return { income, expense, net: income - expense, pending }
}

function newestFirst(a: LedgerEntry, b: LedgerEntry) {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt
}

/**
 * 分组：待到账永远单独一组放最上面；其余按月份（新的在前，三个月以前的默认收起）、副业或分类分。
 */
export function groupLedger(entries: LedgerEntry[], by: LedgerGroupBy, projects: Project[], today: string): LedgerGroup[] {
  const groups: LedgerGroup[] = []
  const pending = entries
    .filter((entry) => entry.status === "pending")
    .sort((a, b) => (a.expectedOn ?? a.date).localeCompare(b.expectedOn ?? b.date))
  if (pending.length > 0) groups.push({ key: "pending", label: getT().ledger.group.pending, items: pending, ...sums(pending), collapsed: false })

  const rest = entries.filter((entry) => entry.status !== "pending").sort(newestFirst)
  const bucket = new Map<string, LedgerEntry[]>()
  const keyOf = (entry: LedgerEntry) =>
    by === "month" ? monthKeyOf(entry.date) : by === "project" ? (entry.projectId ?? "none") : entry.category
  for (const entry of rest) {
    const key = keyOf(entry)
    bucket.set(key, [...(bucket.get(key) ?? []), entry])
  }

  if (by === "month") {
    const thisYear = today.slice(0, 4)
    ;[...bucket.keys()]
      .sort()
      .reverse()
      .forEach((key, index) => {
        const items = bucket.get(key) ?? []
        groups.push({
          key,
          label: formatMonthLabel(`${key}-01`, key.slice(0, 4) !== thisYear),
          items,
          ...sums(items),
          collapsed: index >= 3,
        })
      })
    return groups
  }

  const names = new Map(projects.map((project) => [project.id, project.name]))
  const t = getT().ledger.group
  const rows = [...bucket.entries()].map(([key, items]) => ({
    key,
    label: by === "project" ? (key === "none" ? t.personal : (names.get(key) ?? t.deletedProject)) : categoryLabel(key),
    items,
    ...sums(items),
    collapsed: false,
    projectId: by === "project" ? (key === "none" ? null : key) : undefined,
  }))
  rows.sort((a, b) => (by === "project" ? b.net - a.net : b.income + b.expense - (a.income + a.expense)))
  return [...groups, ...rows]
}
