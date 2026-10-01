import { dayKeyOf, formatDayLong } from "@/domain/calendar"
import { formatAmount } from "@/domain/format"
import { getLocale } from "@/i18n/runtime"
import type { AiChangeset, RecordKind } from "@/sync/protocol"
import type { ChangeSummary, RecordLabel } from "./describe"

export function summaryText(summaries: ChangeSummary[], words: { summarize(action: ChangeSummary["action"], kind: RecordKind, count: number): string; summarySeparator: string; summaryEmpty: string }): string {
  return summaries.length
    ? summaries.map((item) => words.summarize(item.action, item.kind, item.count)).join(words.summarySeparator)
    : words.summaryEmpty
}

export function recordLabelText(label: RecordLabel, words: {
  record: {
    income(amount: string): string
    expense(amount: string): string
    time(date: string, from: string, to: string): string
    week(value: string): string
    profile: string
    timer: string
    unknown: string
  }
}): string {
  if (label.type === "text") return label.value
  if (label.type === "ledger") return words.record[label.direction](formatAmount(label.amount))
  if (label.type === "time") return words.record.time(label.date, label.from, label.to)
  if (label.type === "week") return label.value ? words.record.week(label.value) : words.record.unknown
  if (label.type === "fixed") return words.record[label.value]
  return words.record.unknown
}

export function groupChangesetsByDay(changesets: AiChangeset[]): { day: string; title: string; changesets: AiChangeset[] }[] {
  const groups = new Map<string, AiChangeset[]>()
  for (const changeset of changesets) {
    const day = dayKeyOf(new Date(changeset.createdAt))
    groups.set(day, [...(groups.get(day) ?? []), changeset])
  }
  return [...groups].map(([day, items]) => ({ day, title: formatDayLong(day), changesets: items }))
}

export function formatActivityTime(at: number): string {
  return new Intl.DateTimeFormat(getLocale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(at))
}
