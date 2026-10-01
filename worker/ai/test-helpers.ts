import type { PlannedChange, SubmitInput } from "../mcp/types"
import type { TokenIdentity } from "../types"
import type { TestD1Database } from "../testing/d1-sqlite.d.mts"

export const NOW = 1_760_000_000_000
export const writeToken: TokenIdentity = { id: "tok-write", name: "Writer", tier: "write" }
export const proposeToken: TokenIdentity = { id: "tok-propose", name: "Proposer", tier: "propose" }

export function change(overrides: Partial<PlannedChange> = {}): PlannedChange {
  return {
    kind: "task",
    id: "t-1",
    action: "create",
    before: null,
    beforeUpdatedAt: null,
    beforeRev: null,
    after: { id: "t-1", seq: 0, title: "Task", status: "todo", completedAt: null },
    ...overrides,
  }
}

export function submission(token: TokenIdentity, changes: PlannedChange[], overrides: Partial<SubmitInput> = {}): SubmitInput {
  return { token, tool: "test", reason: null, changes, forcePreview: false, ...overrides }
}

export async function seedRecord(
  db: TestD1Database,
  kind: string,
  id: string,
  data: unknown,
  updatedAt: number,
  rev: number,
  deleted = false
): Promise<void> {
  await db.prepare(
    "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, ?, ?, ?, 'app')"
  ).bind(kind, id, deleted ? null : JSON.stringify(data), updatedAt, rev, deleted).run()
}

export function readRecord(db: TestD1Database, kind: string, id: string) {
  const row = db.rows<{ data: string | null; updated_at: number; rev: number; deleted: number; source: string }>(
    "SELECT data, updated_at, rev, deleted, source FROM records WHERE kind = ? AND id = ?", kind, id
  )[0]
  return row ? { ...row, value: row.data === null ? null : JSON.parse(row.data) as unknown } : undefined
}
