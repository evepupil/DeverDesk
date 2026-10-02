import type { DayKey, LedgerEntry, Project, Routine, Task, TimeEntry, WeekNote, Profile, ActiveTimer } from "../../../src/domain/types"
import { SINGLETON_ID, type RecordKind } from "../../../src/sync/protocol"
import type {
  DataSource,
  EntryQuery,
  LedgerQuery,
  RecordVersion,
  SingletonVersion,
  TaskQuery,
  Versioned,
} from "../types"
import { hasRecordShape } from "./validate"
import { normalizeLimit } from "./rows"

interface RecordRow {
  id: string
  data: string | null
  updated_at: number
  rev: number
  deleted: number
}

interface ProjectTaskCountRow {
  projectId: string | null
  taskCount: number
}

interface TaskMinutesRow {
  taskId: string
  minutes: number
}

interface SqlQuery {
  sql: string
  bindings: unknown[]
}

function addArrayFilter(
  conditions: string[],
  bindings: unknown[],
  expression: string,
  values: readonly (string | number)[] | undefined,
): void {
  if (values === undefined) return
  conditions.push(`${expression} IN (SELECT value FROM json_each(?))`)
  bindings.push(JSON.stringify(values))
}

function withLimit(query: SqlQuery, limit: number | undefined): SqlQuery {
  const normalized = normalizeLimit(limit)
  if (normalized === undefined) return query
  return { sql: `${query.sql} LIMIT ?`, bindings: [...query.bindings, normalized] }
}

function taskFilters(query: TaskQuery): SqlQuery {
  const conditions = ["1 = 1"]
  const bindings: unknown[] = []
  addArrayFilter(conditions, bindings, "id", query.ids)
  addArrayFilter(conditions, bindings, "json_extract(data, '$.seq')", query.seqs)
  addArrayFilter(conditions, bindings, "json_extract(data, '$.status')", query.statuses)
  if (query.plannedFrom !== undefined) {
    conditions.push("json_extract(data, '$.plannedFor') >= ?")
    bindings.push(query.plannedFrom)
  }
  if (query.plannedTo !== undefined) {
    conditions.push("json_extract(data, '$.plannedFor') <= ?")
    bindings.push(query.plannedTo)
  }
  if (query.unplanned === true) conditions.push("json_extract(data, '$.plannedFor') IS NULL")
  if (query.dueFrom !== undefined) {
    conditions.push("json_extract(data, '$.dueOn') IS NOT NULL")
    conditions.push("json_extract(data, '$.dueOn') >= ?")
    bindings.push(query.dueFrom)
  }
  if (query.dueTo !== undefined) {
    conditions.push("json_extract(data, '$.dueOn') IS NOT NULL")
    conditions.push("json_extract(data, '$.dueOn') <= ?")
    bindings.push(query.dueTo)
  }
  if (query.completedFrom !== undefined) {
    conditions.push("json_extract(data, '$.completedAt') >= ?")
    bindings.push(query.completedFrom)
  }
  if (query.completedTo !== undefined) {
    conditions.push("json_extract(data, '$.completedAt') < ?")
    bindings.push(query.completedTo)
  }
  if (query.projectId === null) conditions.push("json_extract(data, '$.projectId') IS NULL")
  else if (query.projectId !== undefined) {
    conditions.push("json_extract(data, '$.projectId') = ?")
    bindings.push(query.projectId)
  }
  if (query.text !== undefined) {
    conditions.push("instr(lower(json_extract(data, '$.title')), lower(?)) > 0")
    bindings.push(query.text)
  }
  return { sql: conditions.join(" AND "), bindings }
}

function taskOrder(query: TaskQuery): string {
  const sequence = "json_extract(data, '$.seq')"
  const priority = "CASE json_extract(data, '$.priority') WHEN 0 THEN -1 ELSE json_extract(data, '$.priority') END"
  const due = "COALESCE(json_extract(data, '$.dueOn'), '9999-12-31')"
  if (query.orderBy === "priority") return `${priority} DESC, ${due} ASC, ${sequence} DESC, id ASC`
  if (query.orderBy === "due") return `${due} ASC, ${priority} DESC, ${sequence} ASC, id ASC`
  return `${sequence} ASC, id ASC`
}

function taskQuery(query: TaskQuery): SqlQuery {
  const filters = taskFilters(query)
  return withLimit({
    sql: "SELECT id, data, updated_at, rev, deleted FROM records WHERE kind = 'task' AND deleted = 0 AND " +
      `${filters.sql} ORDER BY ${taskOrder(query)}`,
    bindings: filters.bindings,
  }, query.limit)
}

function validTaskShape(): string {
  const numeric = (path: string) =>
    `json_type(data, '${path}') IN ('integer', 'real') AND ` +
    `abs(CAST(json_extract(data, '${path}') AS REAL)) <= 1.7976931348623157e308`
  return [
    "json_type(data) = 'object'",
    "json_type(data, '$.id') = 'text'",
    numeric("$.seq"),
    "json_type(data, '$.title') = 'text'",
    "json_type(data, '$.projectId') IN ('null', 'text')",
    "json_type(data, '$.status') = 'text' AND json_extract(data, '$.status') IN ('backlog', 'todo', 'doing', 'done', 'dropped')",
    `${numeric("$.priority")} AND json_extract(data, '$.priority') BETWEEN 0 AND 4`,
    numeric("$.estimateMin"),
    "json_type(data, '$.plannedFor') IN ('null', 'text')",
    "json_type(data, '$.startAt') IN ('null', 'text')",
    "json_type(data, '$.dueOn') IN ('null', 'text')",
    "json_type(data, '$.notes') = 'text'",
    "CASE WHEN json_type(data, '$.subtasks') = 'array' THEN NOT EXISTS (" +
      "SELECT 1 FROM json_each(data, '$.subtasks') AS sub WHERE " +
      "json_type(sub.value) <> 'object' OR " +
      "json_type(sub.value, '$.id') IS NOT 'text' OR " +
      "json_type(sub.value, '$.title') IS NOT 'text' OR " +
      "(json_type(sub.value, '$.done') IS NOT 'true' AND json_type(sub.value, '$.done') IS NOT 'false')) ELSE 0 END",
    numeric("$.createdAt"),
    `(json_type(data, '$.completedAt') = 'null' OR (${numeric("$.completedAt")}))`,
    "(json_type(data, '$.origin') IS NULL OR (json_type(data, '$.origin') = 'text' AND json_extract(data, '$.origin') IN ('ai', 'coding')))",
  ].join(" AND ")
}

function countTasksQuery(query: TaskQuery): SqlQuery {
  const filters = taskFilters(query)
  const bindings = [...filters.bindings]
  const limit = normalizeLimit(query.limit)
  let matchingSql = "SELECT id, data FROM records WHERE kind = 'task' AND deleted = 0 AND " +
    `CASE WHEN json_valid(data) THEN (${validTaskShape()} AND (${filters.sql})) ELSE 0 END = 1`
  if (limit !== undefined) {
    matchingSql += ` ORDER BY ${taskOrder(query)} LIMIT ?`
    bindings.push(limit)
  }
  return {
    sql: "WITH matching AS MATERIALIZED (" + matchingSql + ") " +
      "SELECT json_extract(data, '$.projectId') AS projectId, count(*) AS taskCount " +
      "FROM matching GROUP BY json_extract(data, '$.projectId')",
    bindings,
  }
}

function validEntryShape(): string {
  const numeric = (path: string) =>
    `json_type(data, '${path}') IN ('integer', 'real') AND ` +
    `abs(CAST(json_extract(data, '${path}') AS REAL)) <= 1.7976931348623157e308`
  return [
    "json_type(data) = 'object'",
    "json_type(data, '$.id') = 'text'",
    "json_type(data, '$.taskId') IN ('null', 'text')",
    "json_type(data, '$.projectId') IN ('null', 'text')",
    numeric("$.start"),
    numeric("$.end"),
    "(json_type(data, '$.minutes') IS NULL OR (" + numeric("$.minutes") +
      " AND CAST(json_extract(data, '$.minutes') AS REAL) <= 1000000))",
    "(json_type(data, '$.origin') IS NULL OR (json_type(data, '$.origin') = 'text' AND json_extract(data, '$.origin') IN ('ai', 'coding')))",
  ].join(" AND ")
}

function sumEntryMinutesQuery(taskIds: string[]): SqlQuery {
  return {
    sql: "WITH matching AS MATERIALIZED (" +
      "SELECT data FROM records WHERE kind = 'entry' AND deleted = 0 AND " +
      `CASE WHEN json_valid(data) THEN (${validEntryShape()} AND ` +
      "json_type(data, '$.taskId') = 'text' AND " +
      "json_extract(data, '$.taskId') IN (SELECT value FROM json_each(?))) ELSE 0 END = 1) " +
      "SELECT json_extract(data, '$.taskId') AS taskId, " +
      "sum(CASE WHEN json_type(data, '$.minutes') IN ('integer', 'real') THEN " +
      "CAST(min(1000000.0, max(0.0, round(CAST(json_extract(data, '$.minutes') AS REAL)))) AS INTEGER) ELSE " +
      "CAST(min(1000000.0, max(0.0, round((CAST(json_extract(data, '$.end') AS REAL) - " +
      "CAST(json_extract(data, '$.start') AS REAL)) / 60000.0))) AS INTEGER) END) AS minutes " +
      "FROM matching GROUP BY json_extract(data, '$.taskId')",
    bindings: [JSON.stringify(taskIds)],
  }
}

function entryQuery(query: EntryQuery): SqlQuery {
  const conditions = ["kind = 'entry' AND deleted = 0"]
  const bindings: unknown[] = []
  addArrayFilter(conditions, bindings, "id", query.ids)
  if (query.from !== undefined) {
    conditions.push("json_extract(data, '$.start') >= ?")
    bindings.push(query.from)
  }
  if (query.to !== undefined) {
    conditions.push("json_extract(data, '$.start') < ?")
    bindings.push(query.to)
  }
  if (query.projectId === null) conditions.push("json_extract(data, '$.projectId') IS NULL")
  else if (query.projectId !== undefined) {
    conditions.push("json_extract(data, '$.projectId') = ?")
    bindings.push(query.projectId)
  }
  addArrayFilter(conditions, bindings, "json_extract(data, '$.taskId')", query.taskIds)
  return withLimit({
    sql: "SELECT id, data, updated_at, rev, deleted FROM records WHERE " +
      `${conditions.join(" AND ")} ORDER BY json_extract(data, '$.start') ASC, id ASC`,
    bindings,
  }, query.limit)
}

function ledgerQuery(query: LedgerQuery): SqlQuery {
  const conditions = ["kind = 'ledger' AND deleted = 0"]
  const bindings: unknown[] = []
  addArrayFilter(conditions, bindings, "id", query.ids)
  if (query.from !== undefined) {
    conditions.push("json_extract(data, '$.date') >= ?")
    bindings.push(query.from)
  }
  if (query.to !== undefined) {
    conditions.push("json_extract(data, '$.date') <= ?")
    bindings.push(query.to)
  }
  addArrayFilter(conditions, bindings, "json_extract(data, '$.status')", query.statuses)
  addArrayFilter(conditions, bindings, "json_extract(data, '$.kind')", query.kinds)
  if (query.projectId === null) conditions.push("json_extract(data, '$.projectId') IS NULL")
  else if (query.projectId !== undefined) {
    conditions.push("json_extract(data, '$.projectId') = ?")
    bindings.push(query.projectId)
  }
  addArrayFilter(conditions, bindings, "json_extract(data, '$.externalId')", query.externalIds)
  if (query.text !== undefined) {
    conditions.push("instr(lower(json_extract(data, '$.note')), lower(?)) > 0")
    bindings.push(query.text)
  }
  return withLimit({
    sql: "SELECT id, data, updated_at, rev, deleted FROM records WHERE " +
      `${conditions.join(" AND ")} ORDER BY json_extract(data, '$.date') ASC, ` +
      "json_extract(data, '$.createdAt') ASC, id ASC",
    bindings,
  }, query.limit)
}

function parseRow<T>(row: RecordRow, kind: RecordKind): T | null {
  if (row.data === null) {
    console.warn("Skipping MCP record with empty data", row.id)
    return null
  }
  try {
    const value: unknown = JSON.parse(row.data)
    if (!hasRecordShape(kind, value)) {
      console.warn("Skipping MCP record with invalid data shape", row.id)
      return null
    }
    return value as T
  } catch {
    console.warn("Skipping MCP record with invalid JSON", row.id)
    return null
  }
}

function mapRows<T>(rows: RecordRow[], kind: RecordKind): Versioned<T>[] {
  const values: Versioned<T>[] = []
  for (const row of rows) {
    const value = parseRow<T>(row, kind)
    if (value === null) continue
    values.push({ value, updatedAt: row.updated_at, rev: row.rev })
  }
  return values
}

async function queryRows<T>(db: D1Database, query: SqlQuery, kind: RecordKind): Promise<Versioned<T>[]> {
  const result = await db.prepare(query.sql).bind(...query.bindings).all<RecordRow>()
  return mapRows<T>(result.results, kind)
}

async function readSingleton<T>(db: D1Database, kind: "profile" | "timer"): Promise<SingletonVersion<T>> {
  const row = await db.prepare(
    "SELECT id, data, updated_at, rev, deleted FROM records WHERE kind = ? AND id = ? LIMIT 1"
  ).bind(kind, SINGLETON_ID).first<RecordRow>()
  if (!row) return { value: null, updatedAt: null, rev: null }
  if (row.deleted !== 0) return { value: null, updatedAt: row.updated_at, rev: row.rev }
  const value = parseRow<T>(row, kind)
  return { value, updatedAt: row.updated_at, rev: row.rev }
}

export function createD1DataSource(db: D1Database): DataSource {
  return {
    profile: () => readSingleton<Profile>(db, "profile"),
    timer: () => readSingleton<ActiveTimer>(db, "timer"),
    projects: () => queryRows<Project>(db, {
      sql: "SELECT id, data, updated_at, rev, deleted FROM records WHERE kind = 'project' AND deleted = 0 ORDER BY rev ASC, id ASC",
      bindings: [],
    }, "project"),
    routines: () => queryRows<Routine>(db, {
      sql: "SELECT id, data, updated_at, rev, deleted FROM records WHERE kind = 'routine' AND deleted = 0 ORDER BY rev ASC, id ASC",
      bindings: [],
    }, "routine"),
    notes: (weeks?: DayKey[]) => {
      const conditions = ["kind = 'note' AND deleted = 0"]
      const bindings: unknown[] = []
      addArrayFilter(conditions, bindings, "id", weeks)
      return queryRows<WeekNote>(db, {
        sql: "SELECT id, data, updated_at, rev, deleted FROM records WHERE " +
          `${conditions.join(" AND ")} ORDER BY rev ASC, id ASC`,
        bindings,
      }, "note")
    },
    tasks: (query) => queryRows<Task>(db, taskQuery(query), "task"),
    async countTasksByProject(query) {
      const statement = countTasksQuery(query)
      const result = await db.prepare(statement.sql).bind(...statement.bindings).all<ProjectTaskCountRow>()
      return new Map(result.results.map(({ projectId, taskCount }) => [projectId, Number(taskCount)]))
    },
    entries: (query) => queryRows<TimeEntry>(db, entryQuery(query), "entry"),
    async sumEntryMinutesByTask(taskIds) {
      if (taskIds.length === 0) return new Map()
      const query = sumEntryMinutesQuery(taskIds)
      const result = await db.prepare(query.sql).bind(...query.bindings).all<TaskMinutesRow>()
      return new Map(result.results.map(({ taskId, minutes }) => [taskId, Number(minutes)]))
    },
    ledger: (query) => queryRows<LedgerEntry>(db, ledgerQuery(query), "ledger"),
    async record(kind: RecordKind, id: string): Promise<RecordVersion | null> {
      const row = await db.prepare(
        "SELECT id, data, updated_at, rev, deleted FROM records WHERE kind = ? AND id = ? LIMIT 1"
      ).bind(kind, id).first<RecordRow>()
      if (!row) return null
      if (row.deleted !== 0) return { value: null, updatedAt: row.updated_at, rev: row.rev, deleted: true }
      const value = parseRow<unknown>(row, kind)
      return { value, updatedAt: row.updated_at, rev: row.rev, deleted: false }
    },
  }
}
