// 为未来 AI 助手提供创建任务、记账和个人月度汇总接口。
import type { LedgerEntry, Task, TimeEntry } from "../../src/domain/types"
import { doneIn, minutesIn } from "../../src/domain/insights"
import { totals } from "../../src/domain/ledger"
import { apiError, jsonResponse, readJsonBody } from "../http"
import { createChangesetService } from "../ai/changesets"
import type { TokenIdentity, WorkerEnv } from "../types"
import { readMonthlyData, readProfileTimeZone } from "../db/summary"
import { createClock } from "../mcp/clock"
import { ChangesetError, type SubmitInput, type SubmitResult } from "../mcp/types"
import { randomBase64Url } from "../auth/crypto"
import { monthPeriod, utcDayKey } from "../utc"
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

function changesetErrorResponse(error: ChangesetError): Response {
  switch (error.code) {
    case "not_found": return apiError("改动包不存在", 404)
    case "wrong_status": return apiError("改动包状态已变化，无法执行此操作", 409)
    case "expired": return apiError("预览已过期", 409)
    case "forbidden": return apiError("没有权限执行此操作", 403)
    case "rate_limited": return apiError("改动太频繁，请稍后再试", 429, error.retryAfter ?? 1)
    case "too_many": return apiError("一次最多提交 20 条改动", 400)
  }
}

async function submitChangeset(db: D1Database, input: SubmitInput): Promise<SubmitResult | Response> {
  try {
    return await createChangesetService(db).submit(input)
  } catch (error) {
    if (error instanceof ChangesetError) return changesetErrorResponse(error)
    throw error
  }
}

export async function createTask(request: Request, env: WorkerEnv, token: TokenIdentity): Promise<Response> {
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
  const result = await submitChangeset(env.DB, {
    token,
    tool: "rest:tasks",
    reason: null,
    forcePreview: false,
    changes: [{ kind: "task", id, action: "create", before: null, beforeUpdatedAt: null, beforeRev: null, after: { ...task, origin: "ai" } }],
  })
  if (result instanceof Response) return result
  const stored = result.results[0]?.after
  return jsonResponse({ task: stored && typeof stored === "object" ? stored as Task : task }, 201)
}

export async function createLedgerEntry(request: Request, env: WorkerEnv, token: TokenIdentity): Promise<Response> {
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
  const result = await submitChangeset(env.DB, {
    token,
    tool: "rest:ledger",
    reason: null,
    forcePreview: false,
    changes: [{ kind: "ledger", id: entry.id, action: "create", before: null, beforeUpdatedAt: null, beforeRev: null, after: { ...entry, origin: "ai" } }],
  })
  if (result instanceof Response) return result
  const stored = result.results[0]?.after
  return jsonResponse({ entry: stored && typeof stored === "object" ? stored as LedgerEntry : entry }, 201)
}

export async function getSummary(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url)
  const now = Date.now()
  const clock = createClock(await readProfileTimeZone(env.DB), now)
  const month = url.searchParams.get("month") ?? clock.today.slice(0, 7)
  if (!isValidMonth(month)) return apiError("month 必须是 YYYY-MM", 400)

  const period = monthPeriod(month)
  const [year, monthNumber] = month.split("-").map(Number)
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
  const startAt = clock.startOfDay(period.start)
  const endAt = clock.startOfDay(nextMonth)
  const monthly = await readMonthlyData(env.DB, period.start, period.end, startAt, endAt)
  const ledger = monthly.ledger.filter(validLedger)
  const entries = monthly.entries.filter(validTimeEntry).map((entry) => {
    const shift = clock.toWall(entry.start) - entry.start
    return { ...entry, start: clock.toWall(entry.start), end: entry.end + shift }
  })
  const tasks = monthly.tasks.filter(validTask).map((task) => ({
    ...task,
    completedAt: task.completedAt === null ? null : clock.toWall(task.completedAt),
  }))
  const money = totals(ledger, period.start, period.end)
  return jsonResponse({
    month,
    income: money.income,
    expense: money.expense,
    net: money.net,
    minutes: minutesIn(entries, { start: period.start, end: period.end }),
    doneTasks: doneIn(tasks, { start: period.start, end: period.end }).length,
  })
}
