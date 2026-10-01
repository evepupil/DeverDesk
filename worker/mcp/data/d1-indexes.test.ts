import { describe, expect, it } from "vitest"
import { createTestD1 } from "../../testing/d1-sqlite.mjs"

describe("D1 expression indexes", () => {
  it("uses the four expression indexes after PRAGMA optimize", async () => {
    const db = createTestD1()
    const insert = db.prepare(
      "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, 1, ?, 0, 'app')"
    )
    const firstDay = Date.UTC(2020, 0, 1)
    let rev = 1
    for (let index = 0; index < 1_200; index += 1) {
      const day = new Date(firstDay + index * 86_400_000).toISOString().slice(0, 10)
      await insert.bind("entry", `e-${index}`, JSON.stringify({ start: index }), rev++).run()
      await insert.bind("ledger", `l-${index}`, JSON.stringify({ date: day, createdAt: index }), rev++).run()
      await insert.bind("task", `t-${index}`, JSON.stringify({
        status: index === 1_199 ? "rare" : "todo",
        plannedFor: day,
        seq: index,
      }), rev++).run()
    }
    await db.exec("PRAGMA optimize")

    const plans = [
      db.rows<{ detail: string }>(
        "EXPLAIN QUERY PLAN SELECT id FROM records WHERE kind = 'entry' AND deleted = 0 " +
        "AND json_extract(data, '$.start') >= ? AND json_extract(data, '$.start') < ? " +
        "ORDER BY json_extract(data, '$.start') ASC, id ASC",
        50, 51,
      ),
      db.rows<{ detail: string }>(
        "EXPLAIN QUERY PLAN SELECT id FROM records WHERE kind = 'ledger' AND deleted = 0 " +
        "AND json_extract(data, '$.date') >= ? AND json_extract(data, '$.date') <= ? " +
        "ORDER BY json_extract(data, '$.date') ASC, json_extract(data, '$.createdAt') ASC, id ASC",
        "2023-04-10", "2023-04-10",
      ),
      db.rows<{ detail: string }>(
        "EXPLAIN QUERY PLAN SELECT id FROM records WHERE kind = 'task' AND deleted = 0 " +
        "AND json_extract(data, '$.status') IN (SELECT value FROM json_each(?)) " +
        "ORDER BY json_extract(data, '$.seq') ASC, id ASC",
        JSON.stringify(["rare"]),
      ),
      db.rows<{ detail: string }>(
        "EXPLAIN QUERY PLAN SELECT id FROM records WHERE kind = 'task' AND deleted = 0 " +
        "AND json_extract(data, '$.plannedFor') >= ? AND json_extract(data, '$.plannedFor') <= ? " +
        "ORDER BY json_extract(data, '$.seq') ASC, id ASC",
        "2023-04-10", "2023-04-10",
      ),
    ]
    const expected = [
      "idx_records_entry_start",
      "idx_records_ledger_date",
      "idx_records_task_status",
      "idx_records_task_planned",
    ]
    for (const [index, plan] of plans.entries()) {
      expect(plan.some((row) => row.detail.includes(expected[index]))).toBe(true)
    }
  })
})
