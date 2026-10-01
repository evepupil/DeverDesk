// AI 改动记录服务：权限决策、状态 CAS 与原子落库。
import type { ChangesetActionResult, ChangesetService, SubmitInput, SubmitItemResult, SubmitResult } from "../mcp/types"
import { ChangesetError, MAX_CHANGES_PER_CALL, PREVIEW_THRESHOLD } from "../mcp/types"
import { randomBase64Url } from "../auth/crypto"
import { buildApplyStatements, buildUndoStatements, insertChangeRows, toChangeRows } from "./apply"
import { cleanupChangesets, enforceSubmitRate, CHANGESET_LIMITS } from "./limits"
import { findChangeset, getChangeset, listChangeRows, listChangesets, type ChangeRow, type ChangesetRow } from "./store"

function decisionId(): string {
  return randomBase64Url(12)
}

function wrongStatus(): never {
  throw new ChangesetError("wrong_status", "This changeset is no longer in the expected state.")
}

function notFound(): never {
  throw new ChangesetError("not_found", "Changeset not found.")
}

function forbidden(): never {
  throw new ChangesetError("forbidden", "This token is not allowed to perform that action.")
}

async function requireChangeset(db: D1Database, id: string): Promise<ChangesetRow> {
  const row = await findChangeset(db, id)
  return row ?? notFound()
}

async function latestChangeset(db: D1Database, tokenId: string, status: string): Promise<string> {
  const row = await db.prepare(
    "SELECT id FROM ai_changesets WHERE token_id = ? AND status = ? ORDER BY created_at DESC, id DESC LIMIT 1"
  ).bind(tokenId, status).first<{ id: string }>()
  return row?.id ?? notFound()
}

function requireOwner(row: ChangesetRow, tokenId: string): void {
  if (row.token_id !== tokenId) forbidden()
}

function requireTier(actual: string, expected: "write" | "propose"): void {
  if (actual !== expected) forbidden()
}

function transitionStatement(
  db: D1Database,
  id: string,
  expected: string,
  next: string,
  now: number,
  decision: string,
  tokenId?: string,
  minCreatedAt?: number
): D1PreparedStatement {
  const ownerClause = tokenId === undefined ? "" : " AND token_id = ?"
  const expiryClause = minCreatedAt === undefined ? "" : " AND created_at >= ?"
  const binds: (string | number)[] = [next, now, decision, id, expected]
  if (tokenId !== undefined) binds.push(tokenId)
  if (minCreatedAt !== undefined) binds.push(minCreatedAt)
  return db.prepare(
    `UPDATE ai_changesets SET status = ?, decided_at = ?, decision_id = ? WHERE id = ? AND status = ?${ownerClause}${expiryClause}`
  ).bind(...binds)
}

async function actionResult(db: D1Database, id: string): Promise<ChangesetActionResult> {
  const changeset = await getChangeset(db, id)
  if (!changeset) return notFound()
  return {
    changeset,
    conflicts: changeset.changes.filter((change) => change.state === "conflict").map((change) => change.seq),
  }
}

async function assertTransitionWon(results: D1Result[], db: D1Database, id: string, expected: string): Promise<void> {
  if ((results[0]?.meta.changes ?? 0) > 0) return
  const current = await findChangeset(db, id)
  if (!current) notFound()
  if (expected === "preview" && current.status === "expired") {
    throw new ChangesetError("expired", "This preview has expired.")
  }
  wrongStatus()
}

async function expirePreview(db: D1Database, row: ChangesetRow, tokenId: string, now: number): Promise<void> {
  const results = await db.batch([
    db.prepare(
      "UPDATE ai_changesets SET status = 'expired', decided_at = ?, decision_id = ? " +
      "WHERE id = ? AND status = 'preview' AND token_id = ? AND created_at < ?"
    ).bind(now, decisionId(), row.id, tokenId, now - CHANGESET_LIMITS.previewTtl),
  ])
  if ((results[0]?.meta.changes ?? 0) > 0) throw new ChangesetError("expired", "This preview has expired.")
  const current = await findChangeset(db, row.id)
  if (current?.status === "expired") throw new ChangesetError("expired", "This preview has expired.")
  wrongStatus()
}

async function applyExisting(
  db: D1Database,
  row: ChangesetRow,
  changes: ChangeRow[],
  now: number,
  tokenId?: string,
  expected = row.status,
  expiryBoundary?: number
): Promise<ChangesetActionResult> {
  const decision = decisionId()
  const statements = [
    transitionStatement(db, row.id, expected, "applied", now, decision, tokenId, expiryBoundary),
    ...buildApplyStatements(db, row.id, decision, changes, now, false),
  ]
  const results = await db.batch(statements)
  await assertTransitionWon(results, db, row.id, expected)
  return actionResult(db, row.id)
}

async function undoExisting(
  db: D1Database,
  row: ChangesetRow,
  active: ChangeRow[],
  selected: ChangeRow[],
  allActiveSelected: boolean,
  now: number,
  tokenId?: string
): Promise<ChangesetActionResult> {
  const decision = decisionId()
  const statements = [
    transitionStatement(db, row.id, "applied", "applied", now, decision, tokenId),
    ...buildUndoStatements(db, row.id, decision, selected, now),
  ]
  if (allActiveSelected) {
    const seqs = selected.map((change) => change.seq).join(",")
    statements.push(db.prepare(
      "UPDATE ai_changesets SET status = 'undone' WHERE id = ? AND status = 'applied' AND decision_id = ? " +
      `AND NOT EXISTS (SELECT 1 FROM ai_changes WHERE changeset_id = ? AND seq IN (${seqs || "-1"}) AND state <> 'undone')`
    ).bind(row.id, decision, row.id))
  }
  const results = await db.batch(statements)
  await assertTransitionWon(results, db, row.id, "applied")
  void active
  return actionResult(db, row.id)
}

export function createChangesetService(db: D1Database, now: () => number = Date.now): ChangesetService {
  return {
    async submit(input: SubmitInput): Promise<SubmitResult> {
      const timestamp = now()
      await cleanupChangesets(db, timestamp)
      if (input.changes.length === 0) return { changesetId: null, status: "no_change", results: [], conflicts: [] }
      if (input.changes.length > MAX_CHANGES_PER_CALL) {
        throw new ChangesetError("too_many", `A call can contain at most ${MAX_CHANGES_PER_CALL} changes.`)
      }
      if (input.token.tier === "read") forbidden()
      await enforceSubmitRate(db, input.token.id, input.changes.length, timestamp)

      const status = input.token.tier === "propose"
        ? "proposed"
        : input.forcePreview || input.changes.length > PREVIEW_THRESHOLD
          ? "preview"
          : "applied"
      const id = `cs_${randomBase64Url(12)}`
      const decision = status === "applied" ? decisionId() : null
      const changes = toChangeRows(input.changes, id)
      const statements: D1PreparedStatement[] = [
        db.prepare(
          "INSERT INTO ai_changesets (id, token_id, client_name, tool, reason, status, created_at, decided_at, decision_id) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          id, input.token.id === "session" ? null : input.token.id, input.token.name, input.tool, input.reason,
          status, timestamp, status === "applied" ? timestamp : null, decision,
        ),
        insertChangeRows(db, id, input.changes, status === "applied"),
      ]
      if (status === "applied" && decision) statements.push(...buildApplyStatements(db, id, decision, changes, timestamp, true))
      await db.batch(statements)

      let results: SubmitItemResult[]
      let conflicts: number[] = []
      if (status === "applied") {
        const stored = await listChangeRows(db, id)
        results = stored.map((change) => ({
          seq: change.seq,
          kind: change.kind,
          id: change.record_id,
          state: change.state,
          after: change.state === "applied" ? JSON.parse(change.after_data ?? "null") as unknown : null,
        }))
        conflicts = stored.filter((change) => change.state === "conflict").map((change) => change.seq)
      } else {
        results = input.changes.map((change, seq) => ({ seq, kind: change.kind, id: change.id, state: "pending", after: change.after }))
      }
      return { changesetId: id, status, results, conflicts }
    },

    async confirm(token, changesetId): Promise<ChangesetActionResult> {
      requireTier(token.tier, "write")
      const id = changesetId ?? await latestChangeset(db, token.id, "preview")
      const row = await requireChangeset(db, id)
      requireOwner(row, token.id)
      if (row.status === "expired") throw new ChangesetError("expired", "This preview has expired.")
      if (row.status !== "preview") wrongStatus()
      const timestamp = now()
      const boundary = timestamp - CHANGESET_LIMITS.previewTtl
      if (row.created_at < boundary) await expirePreview(db, row, token.id, timestamp)
      return applyExisting(db, row, await listChangeRows(db, id), timestamp, token.id, "preview", boundary)
    },

    async accept(changesetId): Promise<ChangesetActionResult> {
      const row = await requireChangeset(db, changesetId)
      if (row.status !== "proposed") wrongStatus()
      return applyExisting(db, row, await listChangeRows(db, changesetId), now())
    },

    async reject(changesetId): Promise<ChangesetActionResult> {
      const row = await requireChangeset(db, changesetId)
      if (row.status !== "proposed") wrongStatus()
      const decision = decisionId()
      const results = await db.batch([transitionStatement(db, row.id, "proposed", "rejected", now(), decision)])
      await assertTransitionWon(results, db, row.id, "proposed")
      return actionResult(db, row.id)
    },

    async undo(token, changesetId, seqs): Promise<ChangesetActionResult> {
      requireTier(token.tier, "write")
      const id = changesetId ?? await latestChangeset(db, token.id, "applied")
      const row = await requireChangeset(db, id)
      requireOwner(row, token.id)
      if (row.status !== "applied") wrongStatus()
      return performUndo(id, token.id, seqs, now())
    },

    async undoByUser(changesetId, seqs): Promise<ChangesetActionResult> {
      const row = await requireChangeset(db, changesetId)
      if (row.status !== "applied") wrongStatus()
      return performUndo(changesetId, undefined, seqs, now())
    },

    async withdraw(token, changesetId): Promise<ChangesetActionResult> {
      requireTier(token.tier, "propose")
      const id = changesetId ?? await latestChangeset(db, token.id, "proposed")
      const row = await requireChangeset(db, id)
      requireOwner(row, token.id)
      if (row.status !== "proposed") wrongStatus()
      const decision = decisionId()
      const results = await db.batch([transitionStatement(db, id, "proposed", "withdrawn", now(), decision, token.id)])
      await assertTransitionWon(results, db, id, "proposed")
      return actionResult(db, id)
    },

    async list(query): Promise<import("../../src/sync/protocol").ChangesetListResponse> {
      await cleanupChangesets(db, now())
      return listChangesets(db, query)
    },
  }

  async function performUndo(id: string, tokenId: string | undefined, seqs: number[] | undefined, timestamp: number): Promise<ChangesetActionResult> {
    const changes = await listChangeRows(db, id)
    const active = changes.filter((change) => change.state === "applied")
    const wanted = seqs === undefined ? null : new Set(seqs)
    if (wanted && [...wanted].some((seq) => !Number.isSafeInteger(seq) || seq < 0)) wrongStatus()
    const selected = active.filter((change) => wanted === null || wanted.has(change.seq)).sort((a, b) => b.seq - a.seq)
    if (selected.length === 0) wrongStatus()
    const allActiveSelected = selected.length === active.length
    const row = await requireChangeset(db, id)
    return undoExisting(db, row, active, selected, allActiveSelected, timestamp, tokenId)
  }
}
