import { describe, expect, it } from "vitest"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { InvalidCursorError, listChangesets } from "./store"

async function insertPackage(db: D1Database, id: string, status: string, createdAt: number): Promise<void> {
  await db.prepare(
    "INSERT INTO ai_changesets (id, token_id, client_name, tool, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, "token", "Client", "test", status, createdAt).run()
  await db.prepare(
    "INSERT INTO ai_changes (changeset_id, seq, kind, record_id, action, before_data, after_data, state) VALUES (?, 0, 'task', ?, 'create', NULL, ?, 'pending')"
  ).bind(id, id, JSON.stringify({ id, title: "Created" })).run()
}

describe("changeset listing", () => {
  it("uses stable descending (created_at, id) cursors and reports pending count", async () => {
    const db = createTestD1()
    await insertPackage(db, "cs_0000000000000001", "proposed", 10)
    await insertPackage(db, "cs_0000000000000002", "proposed", 10)
    await insertPackage(db, "cs_0000000000000003", "applied", 10)

    const first = await listChangesets(db, { status: "pending", limit: 1 })
    expect(first.changesets.map((item) => item.id)).toEqual(["cs_0000000000000002"])
    expect(first.changesets[0].changes[0].after).toEqual({ id: "cs_0000000000000002", title: "Created" })
    expect(first.pendingCount).toBe(2)
    expect(first.nextCursor).toEqual(expect.any(String))

    const second = await listChangesets(db, { status: "pending", limit: 1, cursor: first.nextCursor! })
    expect(second.changesets.map((item) => item.id)).toEqual(["cs_0000000000000001"])
    expect(second.nextCursor).toBeNull()
    const all = await listChangesets(db, { status: "all", limit: 10 })
    expect(all.changesets.map((item) => item.id)).toEqual([
      "cs_0000000000000003", "cs_0000000000000002", "cs_0000000000000001",
    ])
  })

  it("rejects empty, malformed, and out-of-range cursors", async () => {
    const db = createTestD1()
    for (const cursor of ["", "not-base64", "e30", "A"]) {
      await expect(listChangesets(db, { status: "all", limit: 20, cursor })).rejects.toBeInstanceOf(InvalidCursorError)
    }
    await expect(listChangesets(db, { status: "all", limit: 0 })).rejects.toBeInstanceOf(RangeError)
  })
})
