import { CADENCE, CHANNELS, currencyLabel, ENTRY_STATUS, PRIORITY, PROJECT_STAGE, TASK_STATUS, categoryLabel } from "@/data/catalog"
import { dayKeyOf, formatDayShort, formatMonthDay, formatWeekRange, minuteOfDay, minutesToTime } from "@/domain/calendar"
import { formatAmount, formatMinutesLong } from "@/domain/format"
import type { Project, Task } from "@/domain/types"
import { getT } from "@/i18n/runtime"
import type { AiFieldKey } from "./types"
import type { AiChangeset, ChangeAction, RecordKind } from "@/sync/protocol"

export interface ChangeSummary {
  action: ChangeAction
  kind: RecordKind
  count: number
}

export type FieldValue = string | { type: "none" | "deletedProject" | "deletedTask" } | { type: "direction"; value: "income" | "expense" }

export type RecordLabel =
  | { type: "text"; value: string }
  | { type: "unknown" }
  | { type: "ledger"; direction: "income" | "expense"; amount: number }
  | { type: "time"; date: string; from: string; to: string }
  | { type: "week"; value: string | null }
  | { type: "fixed"; value: "profile" | "timer" }

export interface FieldChange {
  field: AiFieldKey
  before: FieldValue
  after: FieldValue
}

type Data = Record<string, unknown>

const NO_VALUE: FieldValue = { type: "none" }
const DELETED_PROJECT: FieldValue = { type: "deletedProject" }

function asData(value: unknown): Data {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {}
}

function text(data: Data, key: string): string | undefined {
  const value = data[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function number(data: Data, key: string): number | undefined {
  const value = data[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function dateLabel(value: unknown): FieldValue {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NO_VALUE
  return formatMonthDay(value)
}

function projectLabel(value: unknown, projects: readonly Project[]): FieldValue {
  if (typeof value !== "string" || value.length === 0) return NO_VALUE
  return projects.find((project) => project.id === value)?.name ?? DELETED_PROJECT
}

function subtaskLabel(value: unknown): FieldValue {
  if (!Array.isArray(value)) return NO_VALUE
  if (value.length === 0) return "0"
  return value.map((item) => {
    const subtask = asData(item)
    return `${subtask.done === true ? "✓" : "○"} ${text(subtask, "title") ?? ""}`
  }).join(", ")
}

function milestoneLabel(value: unknown): FieldValue {
  if (!Array.isArray(value)) return NO_VALUE
  if (value.length === 0) return "0"
  return value.map((item) => {
    const milestone = asData(item)
    const due = dateLabel(milestone.due)
    return [
      text(milestone, "title"),
      typeof due === "string" ? due : undefined,
      typeof milestone.doneOn === "string" ? "✓" : undefined,
    ].filter((part): part is string => part !== undefined).join(" · ")
  }).join(", ")
}

function dirNamesLabel(value: unknown): FieldValue {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string") || value.length === 0) return NO_VALUE
  return value.join(", ")
}

function taskLabel(value: unknown, tasks: readonly Task[]): FieldValue {
  if (typeof value !== "string" || value.length === 0) return NO_VALUE
  return tasks.find((task) => task.id === value)?.title ?? { type: "deletedTask" }
}

function colorLabel(value: unknown): FieldValue {
  if (typeof value !== "string") return NO_VALUE
  const colors = getT().forms.project.colors
  return colors[value as keyof typeof colors] ?? value
}

/** Groups changes in the order they first appear in a changeset. */
export function summarize(changeset: Pick<AiChangeset, "changes">): ChangeSummary[] {
  const counts = new Map<string, ChangeSummary>()
  for (const change of changeset.changes) {
    const key = `${change.action}:${change.kind}`
    const existing = counts.get(key)
    if (existing) existing.count += 1
    else counts.set(key, { action: change.action, kind: change.kind, count: 1 })
  }
  return [...counts.values()]
}

/** Returns display data rather than localized prose so callers can use the current UI language. */
export function recordLabel(kind: RecordKind, value: unknown): RecordLabel {
  const data = asData(value)

  if (kind === "task" || kind === "routine") {
    const title = text(data, "title")
    return title ? { type: "text", value: title } : { type: "unknown" }
  }
  if (kind === "project") {
    const name = text(data, "name")
    return name ? { type: "text", value: name } : { type: "unknown" }
  }
  if (kind === "ledger") {
    const note = text(data, "note")
    if (note) return { type: "text", value: note }
    return {
      type: "ledger",
      direction: data.kind === "expense" ? "expense" : "income",
      amount: number(data, "amount") ?? 0,
    }
  }
  if (kind === "entry") {
    const start = number(data, "start") ?? 0
    const end = number(data, "end") ?? start
    return {
      type: "time",
      date: formatMonthDay(dayKeyOf(new Date(start))),
      from: minutesToTime(minuteOfDay(start)),
      to: minutesToTime(minuteOfDay(end)),
    }
  }
  if (kind === "note") {
    const week = text(data, "week")
    return { type: "week", value: week ? formatWeekRange(week) : null }
  }
  return { type: "fixed", value: kind === "profile" ? "profile" : "timer" }
}

/** Lists only changed fields, formatting catalog-backed values through the existing catalogs. */
export function fieldChanges(
  kind: RecordKind,
  before: unknown,
  after: unknown,
  projects: readonly Project[] = [],
  tasks: readonly Task[] = []
): FieldChange[] {
  const left = asData(before)
  const right = asData(after)
  const result: FieldChange[] = []
  const add = (field: AiFieldKey, key: string, format: (value: unknown) => FieldValue = formatRaw) => {
    const oldValue = format(left[key])
    const newValue = format(right[key])
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) result.push({ field, before: oldValue, after: newValue })
  }

  if (kind === "task") {
    add("title", "title")
    add("status", "status", (value) => catalogValue(value, TASK_STATUS))
    add("priority", "priority", (value) => catalogValue(value, PRIORITY))
    add("estimate", "estimateMin", formatMinutesValue)
    add("plan", "plannedFor", dateLabel)
    add("startAt", "startAt")
    add("due", "dueOn", dateLabel)
    add("project", "projectId", (value) => projectLabel(value, projects))
    add("notes", "notes")
    add("subtasks", "subtasks", subtaskLabel)
  } else if (kind === "ledger") {
    add("direction", "kind", (value) => value === "income" || value === "expense" ? { type: "direction", value } : NO_VALUE)
    add("amount", "amount", formatAmountValue)
    add("status", "status", (value) => catalogValue(value, ENTRY_STATUS))
    add("date", "date", dateLabel)
    add("expected", "expectedOn", dateLabel)
    add("category", "category", (value) => typeof value === "string" ? categoryLabel(value) : NO_VALUE)
    add("channel", "channel", (value) => catalogValue(value, CHANNELS))
    add("project", "projectId", (value) => projectLabel(value, projects))
    add("note", "note")
  } else if (kind === "project") {
    add("name", "name")
    add("dirNames", "dirNames", dirNamesLabel)
    add("stage", "stage", (value) => catalogValue(value, PROJECT_STAGE))
    add("goal", "goal")
    add("startedOn", "startedOn", dateLabel)
    add("monthlyTarget", "monthlyTarget", formatAmountValue)
    add("color", "color", colorLabel)
    add("milestones", "milestones", milestoneLabel)
  } else if (kind === "entry") {
    add("task", "taskId", (value) => taskLabel(value, tasks))
    add("project", "projectId", (value) => projectLabel(value, projects))
    add("start", "start", formatTimestamp)
    add("end", "end", formatTimestamp)
    add("minutes", "minutes", formatMinutesValue)
  } else if (kind === "routine") {
    add("title", "title")
    add("cadence", "cadence", (value) => catalogValue(value, CADENCE))
    add("estimate", "estimateMin", formatMinutesValue)
    add("project", "projectId", (value) => projectLabel(value, projects))
    add("archived", "archived", (value) => value === true ? getT().ai.values.archived : value === false ? getT().ai.values.active : NO_VALUE)
  } else if (kind === "note") {
    add("week", "week", dateLabel)
    add("wins", "wins")
    add("improve", "improve")
    add("next", "next")
  } else if (kind === "profile") {
    add("weekdayMin", "weekdayMin", formatMinutesValue)
    add("weekendMin", "weekendMin", formatMinutesValue)
    add("dayStartHour", "dayStartHour", formatHour)
    add("dayEndHour", "dayEndHour", formatHour)
    add("timeZone", "timeZone")
    add("currency", "currency", (value) => typeof value === "string" ? currencyLabel(value) : NO_VALUE)
  } else {
    add("task", "taskId", (value) => taskLabel(value, tasks))
    add("project", "projectId", (value) => projectLabel(value, projects))
    add("label", "label")
    add("startedAt", "startedAt", formatTimestamp)
    add("archived", "archived", (value) => value === true ? getT().ai.values.archived : value === false ? getT().ai.values.active : NO_VALUE)
  }
  return result
}

function formatRaw(value: unknown): FieldValue {
  return value === null || value === undefined || value === "" ? NO_VALUE : String(value)
}

function catalogValue(value: unknown, catalog: Record<string, { readonly label: string }>): FieldValue {
  return typeof value === "string" || typeof value === "number" ? catalog[String(value)]?.label ?? String(value) : NO_VALUE
}

function formatMinutesValue(value: unknown): FieldValue {
  return typeof value === "number" ? formatMinutesLong(value) : NO_VALUE
}

function formatAmountValue(value: unknown): FieldValue {
  return typeof value === "number" ? formatAmount(value) : NO_VALUE
}

function formatHour(value: unknown): FieldValue {
  return typeof value === "number" ? `${String(value).padStart(2, "0")}:00` : NO_VALUE
}

function formatTimestamp(value: unknown): FieldValue {
  return typeof value === "number" && Number.isFinite(value)
    ? `${formatDayShort(dayKeyOf(new Date(value)))} ${minutesToTime(minuteOfDay(value))}`
    : NO_VALUE
}
