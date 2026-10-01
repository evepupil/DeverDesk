import { describe, expect, it } from "vitest"
import { createTestD1 } from "./d1-sqlite.mjs"

describe("测试用 D1", () => {
  it("跑完全部迁移，能读写、能用 JSON 函数", async () => {
    const db = createTestD1()
    await db.prepare("INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, ?, ?, 0, 'app')")
      .bind("task", "t1", JSON.stringify({ id: "t1", status: "todo" }), 5, 1)
      .run()
    const row = await db.prepare("SELECT json_extract(data, '$.status') AS status FROM records WHERE id = ?").bind("t1").first<{ status: string }>()
    expect(row?.status).toBe("todo")
    expect(db.rows("SELECT tier FROM tokens")).toEqual([])
  })

  it("batch 里一条出错，整批都不写", async () => {
    const db = createTestD1()
    const insert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    await expect(db.batch([insert.bind("a", "1"), insert.bind("a", "2")])).rejects.toThrow()
    expect(db.rows("SELECT * FROM settings")).toEqual([])
  })

  it("绑定 undefined 和 D1 一样报错", () => {
    const db = createTestD1()
    expect(() => db.prepare("SELECT ?").bind(undefined)).toThrow(/undefined/)
  })

  it("更新语句返回改了几行", async () => {
    const db = createTestD1()
    await db.prepare("INSERT INTO settings (key, value) VALUES ('a', '1')").run()
    const result = await db.prepare("UPDATE settings SET value = '2' WHERE key = 'a'").run()
    expect(result.meta.changes).toBe(1)
    const none = await db.prepare("UPDATE settings SET value = '3' WHERE key = 'zz'").run()
    expect(none.meta.changes).toBe(0)
  })
})
