// AI 改动包的查询、转换和游标编码。
import type { AiChange, AiChangeset, ChangesetListResponse, ChangesetStatus, ChangeAction, ChangeState, RecordKind } from "../../src/sync/protocol"

export interface ChangesetRow {
  id: string
  token_id: string | null
  client_name: string
  tool: string
  reason: string | null
  status: ChangesetStatus
  created_at: number
  decided_at: number | null
  decision_id: string | null
}

export interface ChangeRow {
  changeset_id: string
  seq: number
  kind: RecordKind
  record_id: string
  action: ChangeAction
  before_data: string | null
  before_updated_at: number | null
  before_rev: number | null
  after_data: string | null
  after_updated_at: number | null
  after_rev: number | null
  state: ChangeState
}

export class InvalidCursorError extends Error {
  constructor() {
    super("游标格式不正确")
    this.name = "InvalidCursorError"
  }
}

function parseData(value: string | null): unknown | null {
  return value === null ? null : JSON.parse(value) as unknown
}

export function toAiChange(row: ChangeRow): AiChange {
  return {
    seq: row.seq,
    kind: row.kind,
    recordId: row.record_id,
    action: row.action,
    before: parseData(row.before_data),
    after: parseData(row.after_data),
    state: row.state,
  }
}

export function toAiChangeset(row: ChangesetRow, changes: ChangeRow[]): AiChangeset {
  return {
    id: row.id,
    tokenId: row.token_id,
    clientName: row.client_name,
    tool: row.tool,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    changes: changes.map(toAiChange),
  }
}

export async function findChangeset(db: D1Database, id: string): Promise<ChangesetRow | null> {
  return db.prepare(
    "SELECT id, token_id, client_name, tool, reason, status, created_at, decided_at, decision_id " +
    "FROM ai_changesets WHERE id = ? LIMIT 1"
  ).bind(id).first<ChangesetRow>()
}

export async function listChangeRows(db: D1Database, id: string): Promise<ChangeRow[]> {
  const result = await db.prepare(
    "SELECT changeset_id, seq, kind, record_id, action, before_data, before_updated_at, before_rev, " +
    "after_data, after_updated_at, after_rev, state FROM ai_changes WHERE changeset_id = ? ORDER BY seq ASC"
  ).bind(id).all<ChangeRow>()
  return result.results
}

export async function getChangeset(db: D1Database, id: string): Promise<AiChangeset | null> {
  const row = await findChangeset(db, id)
  if (!row) return null
  return toAiChangeset(row, await listChangeRows(db, id))
}

interface Cursor {
  createdAt: number
  id: string
}

function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (value === undefined) return null
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new InvalidCursorError()
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = JSON.parse(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4))) as unknown
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) throw new Error("bad cursor")
    const cursor = decoded as Record<string, unknown>
    if (!Number.isSafeInteger(cursor.createdAt) || typeof cursor.id !== "string" || !/^cs_[A-Za-z0-9_-]{16}$/.test(cursor.id)) {
      throw new Error("bad cursor")
    }
    return { createdAt: cursor.createdAt as number, id: cursor.id }
  } catch {
    throw new InvalidCursorError()
  }
}

export async function listChangesets(
  db: D1Database,
  query: { status: "pending" | "all"; cursor?: string; limit: number }
): Promise<ChangesetListResponse> {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) throw new RangeError("limit 超出范围")
  const cursor = decodeCursor(query.cursor)
  const filters: string[] = []
  const bindings: (string | number)[] = []
  if (query.status === "pending") filters.push("status = 'proposed'")
  if (cursor) {
    filters.push("(created_at < ? OR (created_at = ? AND id < ?))")
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id)
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : ""
  const result = await db.prepare(
    "SELECT id, token_id, client_name, tool, reason, status, created_at, decided_at, decision_id " +
    `FROM ai_changesets ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
  ).bind(...bindings, query.limit + 1).all<ChangesetRow>()
  const hasMore = result.results.length > query.limit
  const page = result.results.slice(0, query.limit)

  let changes: ChangeRow[] = []
  if (page.length > 0) {
    const placeholders = page.map(() => "?").join(", ")
    const details = await db.prepare(
      "SELECT changeset_id, seq, kind, record_id, action, before_data, before_updated_at, before_rev, " +
      `after_data, after_updated_at, after_rev, state FROM ai_changes WHERE changeset_id IN (${placeholders}) ORDER BY changeset_id, seq ASC`
    ).bind(...page.map((row) => row.id)).all<ChangeRow>()
    changes = details.results
  }
  const byId = new Map<string, ChangeRow[]>()
  for (const change of changes) {
    const rows = byId.get(change.changeset_id) ?? []
    rows.push(change)
    byId.set(change.changeset_id, rows)
  }
  const pending = await db.prepare("SELECT COUNT(*) AS count FROM ai_changesets WHERE status = 'proposed'")
    .first<{ count: number }>()
  const last = page[page.length - 1]
  return {
    changesets: page.map((row) => toAiChangeset(row, byId.get(row.id) ?? [])),
    pendingCount: pending?.count ?? 0,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  }
}
