// 纯请求体和日期校验逻辑，便于独立单元测试。
import { PUSH_BATCH_SIZE, RECORD_KINDS, type RecordKind, type SyncChange } from "../src/sync/protocol"
import type { Channel, EntryKind, EntryStatus, ExpenseCategory, IncomeCategory, Priority } from "../src/domain/types"

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface TaskInput {
  title: string
  projectId: string | null
  estimateMin: number
  plannedFor: string | null
  priority: Priority
  notes: string
}

export interface LedgerInput {
  kind: EntryKind
  amount: number
  category: IncomeCategory | ExpenseCategory
  channel: Channel
  projectId: string | null
  status: EntryStatus
  date: string
  expectedOn: string | null
  note: string
}

function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value }
}

function invalid<T>(error: string): ValidationResult<T> {
  return { ok: false, error }
}

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function textLength(value: string): number {
  return [...value].length
}

export function isValidDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function isValidMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function validateLoginRequest(value: unknown): ValidationResult<{ password: string }> {
  if (!objectValue(value) || typeof value.password !== "string") return invalid("请求体格式不正确")
  return valid({ password: value.password })
}

export function validatePushRequest(value: unknown): ValidationResult<{ changes: SyncChange[] }> {
  if (!objectValue(value) || !Array.isArray(value.changes)) return invalid("changes 必须是数组")
  if (value.changes.length > PUSH_BATCH_SIZE) return invalid(`每批最多 ${PUSH_BATCH_SIZE} 条改动`)

  const changes: SyncChange[] = []
  for (const item of value.changes) {
    if (!objectValue(item)) return invalid("改动格式不正确")
    if (typeof item.kind !== "string" || !RECORD_KINDS.includes(item.kind as RecordKind)) return invalid("记录种类不正确")
    if (typeof item.id !== "string" || !/^[A-Za-z0-9._:-]{1,100}$/.test(item.id)) return invalid("记录编号格式不正确")
    if (typeof item.updatedAt !== "number" || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0) {
      return invalid("updatedAt 必须是非负整数毫秒")
    }
    if (!Object.prototype.hasOwnProperty.call(item, "data") || item.data === undefined) return invalid("data 字段不正确")

    let serialized: string | undefined
    try {
      serialized = JSON.stringify(item.data)
    } catch {
      return invalid("data 不能序列化为 JSON")
    }
    if (serialized === undefined) return invalid("data 不能序列化为 JSON")
    if (new TextEncoder().encode(serialized).byteLength > 200 * 1024) return invalid("单条 data 不能超过 200 KB")

    changes.push({ kind: item.kind as RecordKind, id: item.id, data: item.data, updatedAt: item.updatedAt })
  }
  return valid({ changes })
}

export function validateTokenInput(value: unknown): ValidationResult<{ name: string }> {
  if (!objectValue(value) || typeof value.name !== "string") return invalid("name 必须是 1–40 个字")
  const name = value.name.trim()
  if (textLength(name) < 1 || textLength(name) > 40) return invalid("name 必须是 1–40 个字")
  return valid({ name })
}

export function validateTaskInput(value: unknown): ValidationResult<TaskInput> {
  if (!objectValue(value) || typeof value.title !== "string") return invalid("title 必须是 1–80 个字")
  const title = value.title.trim()
  if (textLength(title) < 1 || textLength(title) > 80) return invalid("title 必须是 1–80 个字")

  const projectId = value.projectId === undefined || value.projectId === null ? null : value.projectId
  if (projectId !== null && typeof projectId !== "string") return invalid("projectId 格式不正确")

  const estimateMin = value.estimateMin === undefined ? 30 : value.estimateMin
  if (typeof estimateMin !== "number" || !Number.isInteger(estimateMin) || estimateMin < 1 || estimateMin > 1440) {
    return invalid("estimateMin 必须是 1–1440 的整数")
  }

  const plannedFor = value.plannedFor === undefined || value.plannedFor === null ? null : value.plannedFor
  if (plannedFor !== null && !isValidDay(plannedFor)) return invalid("plannedFor 必须是 YYYY-MM-DD 日期")

  const priority = value.priority === undefined ? 0 : value.priority
  if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 4) {
    return invalid("priority 必须是 0–4 的整数")
  }
  if (value.notes !== undefined && typeof value.notes !== "string") return invalid("notes 必须是文字")

  return valid({
    title,
    projectId,
    estimateMin,
    plannedFor,
    priority: priority as Priority,
    notes: (value.notes as string | undefined) ?? "",
  })
}

const incomeCategories: readonly IncomeCategory[] = ["sales", "subscription", "sponsor", "consulting", "ads", "other-income"]
const expenseCategories: readonly ExpenseCategory[] = ["server", "domain", "ai", "tools", "design", "marketing", "other-expense"]
const channels: readonly Channel[] = ["alipay", "wechat", "bank", "platform", "card"]

export function validateLedgerInput(value: unknown, utcToday: string): ValidationResult<LedgerInput> {
  if (!objectValue(value) || (value.kind !== "income" && value.kind !== "expense")) return invalid("kind 必须是 income 或 expense")
  const kind = value.kind as EntryKind

  if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0) return invalid("amount 必须是大于 0 的数字")
  const cents = Math.round(value.amount * 100)
  if (!Number.isSafeInteger(cents) || Math.abs(value.amount * 100 - cents) > 1e-7) return invalid("amount 最多保留两位小数")

  const categoryOptions = kind === "income" ? incomeCategories : expenseCategories
  const defaultCategory = kind === "income" ? "other-income" : "other-expense"
  const category = value.category === undefined ? defaultCategory : value.category
  if (typeof category !== "string" || !categoryOptions.includes(category as never)) return invalid("category 不合法")

  const channel = value.channel === undefined ? "alipay" : value.channel
  if (typeof channel !== "string" || !channels.includes(channel as Channel)) return invalid("channel 不合法")

  const projectId = value.projectId === undefined || value.projectId === null ? null : value.projectId
  if (projectId !== null && typeof projectId !== "string") return invalid("projectId 格式不正确")

  let status: EntryStatus = "received"
  if (kind === "income") {
    status = value.status === undefined ? "received" : value.status as EntryStatus
    if (status !== "received" && status !== "pending") return invalid("收入 status 必须是 received 或 pending")
  } else if (value.status !== undefined && value.status !== "received") {
    return invalid("支出 status 必须是 received")
  }

  const date = value.date === undefined ? utcToday : value.date
  if (!isValidDay(date)) return invalid("date 必须是 YYYY-MM-DD 日期")

  let expectedOn: string | null = null
  if (status === "pending") {
    if (!isValidDay(value.expectedOn)) return invalid("待到账收入必须提供有效的 expectedOn")
    expectedOn = value.expectedOn
  } else if (value.expectedOn !== undefined && value.expectedOn !== null && !isValidDay(value.expectedOn)) {
    return invalid("expectedOn 必须是 YYYY-MM-DD 日期")
  }

  if (value.note !== undefined && typeof value.note !== "string") return invalid("note 必须是文字")
  const note = (value.note as string | undefined) ?? ""
  if (textLength(note) > 200) return invalid("note 最多 200 个字")

  return valid({
    kind,
    amount: cents / 100,
    category: category as IncomeCategory | ExpenseCategory,
    channel: channel as Channel,
    projectId,
    status,
    date,
    expectedOn,
    note,
  })
}
