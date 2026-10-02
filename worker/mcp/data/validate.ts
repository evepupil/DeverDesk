import type {
  ActiveTimer,
  LedgerEntry,
  Profile,
  Project,
  Routine,
  Task,
  TimeEntry,
  WeekNote,
} from "../../../src/domain/types"
import { validateDirNames } from "../../../src/domain/dir-names"
import type { RecordKind } from "../../../src/sync/protocol"

const TASK_STATUSES = ["backlog", "todo", "doing", "done", "dropped"]
const PROJECT_STAGES = ["idea", "building", "running", "paused", "ended"]
const LABEL_COLORS = ["red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink", "gray"]
const CADENCES = ["daily", "weekdays", "weekly", "monthly"]
const ENTRY_KINDS = ["income", "expense"]
const ENTRY_STATUSES = ["pending", "received", "refunded"]
const CHANNELS = ["alipay", "wechat", "bank", "platform", "card"]
const CATEGORIES = ["sales", "subscription", "sponsor", "consulting", "ads", "other-income", "server", "domain", "ai", "tools", "design", "marketing", "other-expense"]

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function string(value: unknown): value is string {
  return typeof value === "string"
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function nullableString(value: unknown): value is string | null {
  return value === null || string(value)
}

function originIsValid(value: Record<string, unknown>): boolean {
  return value.origin === undefined || value.origin === "ai" || value.origin === "coding"
}

function dirNamesAreValid(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || !value.every(string)) return false
  return validateDirNames(value, [], null).ok
}

function isSubtask(value: unknown): boolean {
  return object(value) && string(value.id) && string(value.title) && typeof value.done === "boolean"
}

function isMilestone(value: unknown): boolean {
  return object(value) && string(value.id) && string(value.title) && string(value.due) &&
    nullableString(value.doneOn)
}

function isProject(value: unknown): value is Project {
  return object(value) && string(value.id) && string(value.name) &&
    string(value.color) && LABEL_COLORS.includes(value.color) &&
    string(value.stage) && PROJECT_STAGES.includes(value.stage) && string(value.goal) &&
    string(value.startedOn) && (value.monthlyTarget === null || finite(value.monthlyTarget)) &&
    Array.isArray(value.milestones) && value.milestones.every(isMilestone) && dirNamesAreValid(value.dirNames)
}

function isTask(value: unknown): value is Task {
  return object(value) && string(value.id) && finite(value.seq) && string(value.title) &&
    nullableString(value.projectId) && string(value.status) && TASK_STATUSES.includes(value.status) &&
    finite(value.priority) && value.priority >= 0 && value.priority <= 4 &&
    finite(value.estimateMin) && (value.plannedFor === null || string(value.plannedFor)) &&
    (value.startAt === null || string(value.startAt)) && (value.dueOn === null || string(value.dueOn)) &&
    string(value.notes) && Array.isArray(value.subtasks) && value.subtasks.every(isSubtask) &&
    finite(value.createdAt) && (value.completedAt === null || finite(value.completedAt)) && originIsValid(value)
}

function isTimeEntry(value: unknown): value is TimeEntry {
  return object(value) && string(value.id) && nullableString(value.taskId) && nullableString(value.projectId) &&
    finite(value.start) && finite(value.end) && (value.minutes === undefined || finite(value.minutes)) && originIsValid(value)
}

function isLedgerEntry(value: unknown): value is LedgerEntry {
  return object(value) && string(value.id) && string(value.kind) && ENTRY_KINDS.includes(value.kind) &&
    finite(value.amount) && value.amount > 0 && nullableString(value.projectId) && string(value.category) &&
    CATEGORIES.includes(value.category) && string(value.channel) && CHANNELS.includes(value.channel) &&
    string(value.status) && ENTRY_STATUSES.includes(value.status) && string(value.date) &&
    nullableString(value.expectedOn) && string(value.note) && finite(value.createdAt) &&
    (value.externalId === undefined || string(value.externalId)) && originIsValid(value)
}

function isRoutine(value: unknown): value is Routine {
  return object(value) && string(value.id) && string(value.title) && string(value.cadence) &&
    CADENCES.includes(value.cadence) && finite(value.estimateMin) && nullableString(value.projectId) &&
    Array.isArray(value.doneOn) && value.doneOn.every(string) && string(value.createdOn) &&
    typeof value.archived === "boolean"
}

function isWeekNote(value: unknown): value is WeekNote {
  return object(value) && string(value.week) && string(value.wins) && string(value.improve) && string(value.next)
}

function isProfile(value: unknown): value is Profile {
  return object(value) && string(value.name) && finite(value.weekdayMin) && finite(value.weekendMin) &&
    finite(value.dayStartHour) && finite(value.dayEndHour) &&
    (value.currency === undefined || string(value.currency)) &&
    (value.timeZone === undefined || string(value.timeZone))
}

function isActiveTimer(value: unknown): value is ActiveTimer {
  return object(value) && nullableString(value.taskId) && nullableString(value.projectId) &&
    string(value.label) && finite(value.startedAt)
}

export function hasRecordShape(kind: RecordKind, value: unknown): boolean {
  switch (kind) {
    case "project": return isProject(value)
    case "task": return isTask(value)
    case "entry": return isTimeEntry(value)
    case "ledger": return isLedgerEntry(value)
    case "routine": return isRoutine(value)
    case "note": return isWeekNote(value)
    case "profile": return isProfile(value)
    case "timer": return isActiveTimer(value)
  }
}
