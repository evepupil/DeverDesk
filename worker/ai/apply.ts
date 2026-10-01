// 改动包内 records 写入与撤销 SQL；调用方把返回语句和状态 CAS 放在同一 batch。
import type { PlannedChange } from "../mcp/types"
import type { ChangeRow } from "./store"

function serialize(value: unknown | null): string | null {
  if (value === null) return null
  const result = JSON.stringify(value)
  if (result === undefined) throw new TypeError("改动内容不能序列化为 JSON")
  return result
}

function taskDataExpression(row: ChangeRow): string {
  return row.kind === "task" && row.action === "create"
    ? "json_set(?, '$.seq', (SELECT COALESCE(MAX(CAST(json_extract(data, '$.seq') AS INTEGER)), 100) + 1 FROM records WHERE kind = 'task' AND deleted = 0))"
    : "?"
}

function changeValues(changes: PlannedChange[]): string {
  return JSON.stringify(changes.map((change, seq) => ({
    seq,
    kind: change.kind,
    recordId: change.id,
    action: change.action,
    beforeData: serialize(change.before),
    beforeUpdatedAt: change.beforeUpdatedAt,
    beforeRev: change.beforeRev,
    afterData: serialize(change.after),
  })))
}

export function insertChangeRows(db: D1Database, changesetId: string, changes: PlannedChange[], applying: boolean): D1PreparedStatement {
  const marker = applying ? "(SELECT COALESCE(MAX(rev), 0) FROM records)" : "NULL"
  return db.prepare(
    "INSERT INTO ai_changes (changeset_id, seq, kind, record_id, action, before_data, before_updated_at, before_rev, " +
    "after_data, after_updated_at, after_rev, state) " +
    `SELECT ?, json_extract(value, '$.seq'), json_extract(value, '$.kind'), json_extract(value, '$.recordId'), ` +
    `json_extract(value, '$.action'), json_extract(value, '$.beforeData'), json_extract(value, '$.beforeUpdatedAt'), ` +
    `json_extract(value, '$.beforeRev'), json_extract(value, '$.afterData'), NULL, ${marker}, 'pending' FROM json_each(?)`
  ).bind(changesetId, changeValues(changes))
}

function firstSeqs(changes: ChangeRow[]): number[] {
  const seen = new Set<string>()
  const result: number[] = []
  for (const change of changes) {
    const key = `${change.kind}\u0000${change.record_id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(change.seq)
  }
  return result
}

function buildRecordWrite(db: D1Database, changesetId: string, decisionId: string, row: ChangeRow, now: number): D1PreparedStatement {
  const afterData = row.after_data
  const updatedAt = Math.max(now, (row.before_updated_at ?? now - 1) + 1)
  const dataExpr = taskDataExpression(row)
  const decision = "EXISTS (SELECT 1 FROM ai_changesets WHERE id = ? AND decision_id = ?)"

  if (row.action === "create") {
    if (row.before_rev === null) {
      return db.prepare(
        `INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) SELECT ?, ?, ${dataExpr}, ?, ` +
        "(SELECT COALESCE(MAX(rev), 0) + 1 FROM records), 0, 'api' WHERE " + decision +
        " ON CONFLICT(kind, id) DO NOTHING"
      ).bind(row.kind, row.record_id, afterData, updatedAt, changesetId, decisionId)
    }
    return db.prepare(
      `INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) SELECT ?, ?, ${dataExpr}, ?, ` +
      "(SELECT COALESCE(MAX(rev), 0) + 1 FROM records), 0, 'api' FROM records WHERE kind = ? AND id = ? AND deleted = 1 AND rev = ? AND " + decision +
      " ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, rev = excluded.rev, " +
      "deleted = 0, source = 'api' WHERE records.deleted = 1 AND records.rev = ? AND " + decision
    ).bind(row.kind, row.record_id, afterData, updatedAt, row.kind, row.record_id, row.before_rev, changesetId, decisionId, row.before_rev, changesetId, decisionId)
  }

  const data = row.action === "delete" ? null : afterData
  return db.prepare(
    "UPDATE records SET data = ?, updated_at = ?, rev = (SELECT COALESCE(MAX(rev), 0) + 1 FROM records), " +
    `deleted = ${row.action === "delete" ? 1 : 0}, source = 'api' WHERE kind = ? AND id = ? AND rev = ? AND ${decision}`
  ).bind(data, updatedAt, row.kind, row.record_id, row.before_rev, changesetId, decisionId)
}

export function buildApplyStatements(
  db: D1Database,
  changesetId: string,
  decisionId: string,
  rows: ChangeRow[],
  now: number,
  cutoffAlreadyStored: boolean
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = []
  if (!cutoffAlreadyStored) {
    statements.push(db.prepare(
      "UPDATE ai_changes SET after_rev = (SELECT COALESCE(MAX(rev), 0) FROM records) " +
      "WHERE changeset_id = ? AND state = 'pending' AND EXISTS " +
      "(SELECT 1 FROM ai_changesets WHERE id = ? AND decision_id = ?)"
    ).bind(changesetId, changesetId, decisionId))
  }
  const eligible = new Set(firstSeqs(rows))
  for (const row of rows) {
    if (eligible.has(row.seq)) statements.push(buildRecordWrite(db, changesetId, decisionId, row, now))
  }
  const eligibleSql = [...eligible].join(",") || "-1"
  const success = `seq IN (${eligibleSql}) AND EXISTS (SELECT 1 FROM records r WHERE r.kind = ai_changes.kind AND r.id = ai_changes.record_id AND r.rev > ai_changes.after_rev AND r.source = 'api')`
  statements.push(db.prepare(
    "UPDATE ai_changes SET " +
    `state = CASE WHEN ${success} THEN 'applied' ELSE 'conflict' END, ` +
    `after_data = CASE WHEN ${success} AND kind = 'task' AND action = 'create' THEN ` +
    "(SELECT r.data FROM records r WHERE r.kind = ai_changes.kind AND r.id = ai_changes.record_id) ELSE after_data END, " +
    `after_updated_at = CASE WHEN ${success} THEN ` +
    "(SELECT r.updated_at FROM records r WHERE r.kind = ai_changes.kind AND r.id = ai_changes.record_id) ELSE NULL END, " +
    `after_rev = CASE WHEN ${success} THEN ` +
    "(SELECT r.rev FROM records r WHERE r.kind = ai_changes.kind AND r.id = ai_changes.record_id) ELSE NULL END " +
    "WHERE changeset_id = ? AND state = 'pending' AND EXISTS " +
    "(SELECT 1 FROM ai_changesets WHERE id = ? AND decision_id = ?)"
  ).bind(changesetId, changesetId, decisionId))
  return statements
}

export function buildUndoStatements(
  db: D1Database,
  changesetId: string,
  decisionId: string,
  rows: ChangeRow[],
  now: number
): D1PreparedStatement[] {
  const seqs = rows.map((row) => row.seq)
  const seqSql = seqs.join(",") || "-1"
  const decision = "EXISTS (SELECT 1 FROM ai_changesets WHERE id = ? AND decision_id = ?)"
  const statements: D1PreparedStatement[] = [db.prepare(
    "UPDATE ai_changes SET after_rev = (SELECT COALESCE(MAX(rev), 0) FROM records) " +
    `WHERE changeset_id = ? AND state = 'applied' AND seq IN (${seqSql}) AND ${decision}`
  ).bind(changesetId, changesetId, decisionId)]

  for (const row of rows) {
    const data = row.action === "create" ? null : row.before_data
    const deleted = row.action === "create" ? 1 : 0
    const updatedAt = Math.max(now, (row.after_updated_at ?? now - 1) + 1)
    statements.push(db.prepare(
      "UPDATE records SET data = ?, updated_at = ?, rev = (SELECT COALESCE(MAX(rev), 0) + 1 FROM records), " +
      `deleted = ${deleted}, source = 'api' WHERE kind = ? AND id = ? AND rev = ? AND ${decision}`
    ).bind(data, updatedAt, row.kind, row.record_id, row.after_rev, changesetId, decisionId))
  }

  const restoreRev = rows.map((row) => `WHEN ${row.seq} THEN ?`).join(" ") || "WHEN -1 THEN NULL"
  const revBindings = rows.map((row) => row.after_rev)
  const selection = rows.map((row) => row.seq).join(",") || "-1"
  statements.push(db.prepare(
    "UPDATE ai_changes SET state = CASE WHEN EXISTS (SELECT 1 FROM records r WHERE r.kind = ai_changes.kind " +
    "AND r.id = ai_changes.record_id AND r.rev > ai_changes.after_rev AND r.source = 'api') THEN 'undone' ELSE 'conflict' END, " +
    `after_rev = CASE seq ${restoreRev} ELSE after_rev END ` +
    `WHERE changeset_id = ? AND state = 'applied' AND seq IN (${selection}) AND ${decision}`
  ).bind(...revBindings, changesetId, changesetId, decisionId))
  return statements
}

export function toChangeRows(changes: PlannedChange[], changesetId: string): ChangeRow[] {
  return changes.map((change, seq) => ({
    changeset_id: changesetId,
    seq,
    kind: change.kind,
    record_id: change.id,
    action: change.action,
    before_data: serialize(change.before),
    before_updated_at: change.beforeUpdatedAt,
    before_rev: change.beforeRev,
    after_data: serialize(change.after),
    after_updated_at: null,
    after_rev: null,
    state: "pending",
  }))
}
