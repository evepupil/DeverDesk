// 为未来 AI 助手提供创建任务、记账和个人月度汇总接口。
import type { LedgerEntry, Task, TimeEntry } from "../../src/domain/types"
import { doneIn, minutesIn, type Period } from "../../src/domain/insights"
import { totals } from "../../src/domain/ledger"
import { apiError, jsonResponse, readJsonBody } from "../http"
import type { WorkerEnv } from "../types"
import { insertApiRecord, insertApiTask } from "../db/records"
import { listLiveData } from "../db/summary"
import { randomBase64Url } from "../auth/crypto"
import { monthPeriod, utcDayKey, utcMonthKey } from "../utc"
import { isValidDay, isValidMonth, validateLedgerInput, validateTaskInput } from "../validation"

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validLedger(value: unknown): value is LedgerEntry {
  return isObject(value) &&
    (value.kind === "income" || value.kind === "expense") &&
    typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount > 0 &&
    (value.status === "received" || value.status === "pending" || value.status === "refunded") &&
    isValidDay(value.date)
}

function validTimeEntry(value: unknown): value is TimeEntry {
  return isObject(value) && typeof value.start === "number" && Number.isFinite(value.start) &&
    typeof value.end === "number" && Number.isFinite(value.end)
}

function validTask(value: unknown): value is Task {
  return isObject(value) && typeof value.status === "string" &&
    (value.completedAt === null || (typeof value.completedAt === "number" && Number.isFinite(value.completedAt)))
}

export async function createTask(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = validateTaskInput(body.value)
  if (!parsed.ok) return apiError(parsed.error, 400)

  const now = Date.now()
  const id = `t-${randomBase64Url(12)}`
  const task: Task = {
    id,
    seq: 0,
    title: parsed.value.title,
    projectId: parsed.value.projectId,
    status: "todo",
    priority: parsed.value.priority,
    estimateMin: parsed.value.estimateMin,
    plannedFor: parsed.value.plannedFor,
    startAt: null,
    dueOn: null,
    notes: parsed.value.notes,
    subtasks: [],
    createdAt: now,
    completedAt: null,
  }
  const stored = await insertApiTask(env.DB, id, task, now) as Task
  return jsonResponse({ task: stored }, 201)
}

export async function createLedgerEntry(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = validateLedgerInput(body.value, utcDayKey())
  if (!parsed.ok) return apiError(parsed.error, 400)

  const now = Date.now()
  const entry: LedgerEntry = {
    id: `L-${randomBase64Url(12)}`,
    ...parsed.value,
    createdAt: now,
  }
  await insertApiRecord(env.DB, "ledger", entry.id, entry, now)
  return jsonResponse({ entry }, 201)
}

export async function getSummary(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url)
  const month = url.searchParams.get("month") ?? utcMonthKey()
  if (!isValidMonth(month)) return apiError("month 必须是 YYYY-MM", 400)

  const period = monthPeriod(month)
  const range: Period = { start: period.start, end: period.end }
  const [ledgerData, timeData, taskData] = await Promise.all([
    listLiveData(env.DB, "ledger"),
    listLiveData(env.DB, "entry"),
    listLiveData(env.DB, "task"),
  ])
  const ledger = ledgerData.filter(validLedger)
  const entries = timeData.filter(validTimeEntry)
  const tasks = taskData.filter(validTask)
  const money = totals(ledger, range.start, range.end)
  return jsonResponse({
    month,
    income: money.income,
    expense: money.expense,
    net: money.net,
    minutes: minutesIn(entries, range),
    doneTasks: doneIn(tasks, range).length,
  })
}
