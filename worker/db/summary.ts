// 按月用 0003 的表达式索引读取月度汇总记录。
export interface MonthlyData {
  ledger: unknown[]
  entries: unknown[]
  tasks: unknown[]
}

function parseRows(rows: Array<{ data: string | null }>): unknown[] {
  const values: unknown[] = []
  for (const row of rows) {
    if (row.data === null) continue
    try {
      values.push(JSON.parse(row.data) as unknown)
    } catch {
      continue
    }
  }
  return values
}

export async function readProfileTimeZone(db: D1Database): Promise<string | undefined> {
  const row = await db.prepare(
    "SELECT data FROM records WHERE kind = 'profile' AND id = 'singleton' AND deleted = 0 LIMIT 1"
  ).first<{ data: string | null }>()
  if (!row?.data) return undefined
  try {
    const profile = JSON.parse(row.data) as unknown
    if (typeof profile !== "object" || profile === null || Array.isArray(profile)) return undefined
    const timeZone = (profile as Record<string, unknown>).timeZone
    return typeof timeZone === "string" ? timeZone : undefined
  } catch {
    return undefined
  }
}

export async function readMonthlyData(
  db: D1Database,
  startDay: string,
  endDay: string,
  startAt: number,
  endAt: number
): Promise<MonthlyData> {
  const [ledger, entries, tasks] = await Promise.all([
    db.prepare(
      "SELECT data FROM records INDEXED BY idx_records_ledger_date WHERE kind = 'ledger' AND deleted = 0 " +
      "AND json_extract(data, '$.date') >= ? AND json_extract(data, '$.date') <= ?"
    ).bind(startDay, endDay).all<{ data: string | null }>(),
    db.prepare(
      "SELECT data FROM records INDEXED BY idx_records_entry_start WHERE kind = 'entry' AND deleted = 0 " +
      "AND json_extract(data, '$.start') >= ? AND json_extract(data, '$.start') < ?"
    ).bind(startAt, endAt).all<{ data: string | null }>(),
    db.prepare(
      "SELECT data FROM records INDEXED BY idx_records_task_completed WHERE kind = 'task' AND deleted = 0 " +
      "AND json_extract(data, '$.status') = 'done' " +
      "AND json_extract(data, '$.completedAt') >= ? AND json_extract(data, '$.completedAt') < ?"
    ).bind(startAt, endAt).all<{ data: string | null }>(),
  ])
  return { ledger: parseRows(ledger.results), entries: parseRows(entries.results), tasks: parseRows(tasks.results) }
}
