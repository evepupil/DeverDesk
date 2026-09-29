// 按记录种类读取未删除的 JSON 数据，供汇总接口使用。
export async function listLiveData(db: D1Database, kind: "ledger" | "entry" | "task"): Promise<unknown[]> {
  const result = await db.prepare("SELECT data FROM records WHERE kind = ? AND deleted = 0 ORDER BY rev ASC")
    .bind(kind)
    .all<{ data: string | null }>()
  const values: unknown[] = []
  for (const row of result.results) {
    if (row.data === null) continue
    try {
      values.push(JSON.parse(row.data) as unknown)
    } catch {
      continue
    }
  }
  return values
}
