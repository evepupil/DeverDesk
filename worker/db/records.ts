// D1 同步记录读写、冲突拒绝结果和 API 来源记录创建。
import type { RecordKind, SyncChange, SyncRecord } from "../../src/sync/protocol"

interface RecordRow {
  kind: RecordKind
  id: string
  data: string | null
  updated_at: number
  rev: number
}

function toSyncRecord(row: RecordRow): SyncRecord {
  return {
    kind: row.kind,
    id: row.id,
    data: row.data === null ? null : JSON.parse(row.data) as unknown,
    updatedAt: row.updated_at,
    rev: row.rev,
  }
}

export async function pullRecords(db: D1Database, since: number, limit: number): Promise<SyncRecord[]> {
  const result = await db.prepare(
    "SELECT kind, id, data, updated_at, rev FROM records WHERE rev > ? ORDER BY rev ASC LIMIT ?"
  ).bind(since, limit).all<RecordRow>()
  return result.results.map(toSyncRecord)
}

export async function pushRecords(db: D1Database, changes: SyncChange[]): Promise<SyncRecord[]> {
  if (changes.length === 0) return []
  const statements = changes.map((change) => {
    const deleted = change.data === null ? 1 : 0
    const data = change.data === null ? null : JSON.stringify(change.data)
    return db.prepare(
      "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) " +
      "VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(rev), 0) + 1 FROM records), ?, 'app') " +
      "ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, " +
      "deleted = excluded.deleted, source = excluded.source, rev = excluded.rev " +
      "WHERE excluded.updated_at >= records.updated_at"
    ).bind(change.kind, change.id, data, change.updatedAt, deleted)
  })

  const results = await db.batch(statements)
  const rejectedKeys: string[] = []
  const keySet = new Set<string>()
  for (let index = 0; index < results.length; index += 1) {
    if ((results[index].meta.changes ?? 0) !== 0) continue
    const change = changes[index]
    const key = `${change.kind}\u0000${change.id}`
    if (!keySet.has(key)) {
      keySet.add(key)
      rejectedKeys.push(key)
    }
  }
  if (rejectedKeys.length === 0) return []

  const uniqueChanges = new Map<string, SyncChange>()
  for (const change of changes) uniqueChanges.set(`${change.kind}\u0000${change.id}`, change)
  const rejectedChanges = rejectedKeys.map((key) => uniqueChanges.get(key)!).filter(Boolean)
  const where = rejectedChanges.map(() => "(kind = ? AND id = ?)").join(" OR ")
  const bindings = rejectedChanges.flatMap((change) => [change.kind, change.id])
  const current = await db.prepare(
    `SELECT kind, id, data, updated_at, rev FROM records WHERE ${where}`
  ).bind(...bindings).all<RecordRow>()
  const currentByKey = new Map(current.results.map((row) => [`${row.kind}\u0000${row.id}`, toSyncRecord(row)]))
  return rejectedKeys.map((key) => currentByKey.get(key)).filter((record): record is SyncRecord => record !== undefined)
}

export async function insertApiRecord(
  db: D1Database,
  kind: RecordKind,
  id: string,
  data: unknown,
  updatedAt: number
): Promise<void> {
  await db.prepare(
    "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) " +
    "VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(rev), 0) + 1 FROM records), 0, 'api')"
  ).bind(kind, id, JSON.stringify(data), updatedAt).run()
}

export async function insertApiTask(db: D1Database, id: string, task: unknown, updatedAt: number): Promise<unknown> {
  const result = await db.prepare(
    "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) " +
    "VALUES ('task', ?, json_set(?, '$.seq', (SELECT COALESCE(MAX(CAST(json_extract(data, '$.seq') AS INTEGER)), 100) + 1 FROM records WHERE kind = 'task' AND deleted = 0)), ?, " +
    "(SELECT COALESCE(MAX(rev), 0) + 1 FROM records), 0, 'api') RETURNING data"
  ).bind(id, JSON.stringify(task), updatedAt).first<{ data: string }>()
  if (!result) throw new Error("task insert returned no record")
  return JSON.parse(result.data) as unknown
}
