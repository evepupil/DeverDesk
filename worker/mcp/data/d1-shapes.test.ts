import { describe, expect, it, vi } from "vitest"
import type { RecordKind } from "../../../src/sync/protocol"
import { createTestD1 } from "../../testing/d1-sqlite.mjs"
import { createD1DataSource } from "./d1"

const invalidRows: { kind: RecordKind; id: string; value: unknown; rev: number }[] = [
  { kind: "project", id: "bad-project", value: { id: "bad-project", name: "Bad", color: "blue", stage: "idea", goal: "", startedOn: "2026-01-01", monthlyTarget: null }, rev: 1 },
  { kind: "task", id: "bad-task", value: { id: "bad-task", seq: 1, title: "Bad", projectId: null, status: "todo", priority: 0, estimateMin: 0, plannedFor: null, startAt: null, dueOn: null, notes: "", createdAt: 1, completedAt: null }, rev: 2 },
  { kind: "entry", id: "bad-entry", value: { id: "bad-entry", taskId: null, projectId: null, start: 1 }, rev: 3 },
  { kind: "ledger", id: "bad-ledger", value: { id: "bad-ledger" }, rev: 4 },
  { kind: "routine", id: "bad-routine", value: { id: "bad-routine", title: "Bad", cadence: "daily", estimateMin: 10, projectId: null, createdOn: "2026-01-01", archived: false }, rev: 5 },
  { kind: "note", id: "2026-01-05", value: { week: "2026-01-05", wins: "", improve: "" }, rev: 6 },
  { kind: "profile", id: "singleton", value: { name: "Bad" }, rev: 7 },
  { kind: "timer", id: "singleton", value: { taskId: null, projectId: null, label: "Bad" }, rev: 8 },
]

describe("D1 data row validation", () => {
  it("warns once and skips malformed shapes across all record kinds", async () => {
    const db = createTestD1()
    const insert = db.prepare(
      "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, ?, ?, 0, 'app')",
    )
    for (const row of invalidRows) {
      await insert.bind(row.kind, row.id, JSON.stringify(row.value), 100 + row.rev, row.rev).run()
    }

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      const source = createD1DataSource(db)
      expect(await source.projects()).toEqual([])
      expect(await source.tasks({})).toEqual([])
      expect(await source.entries({})).toEqual([])
      expect(await source.ledger({})).toEqual([])
      expect(await source.routines()).toEqual([])
      expect(await source.notes()).toEqual([])
      expect(await source.profile()).toEqual({ value: null, updatedAt: 107, rev: 7 })
      expect(await source.timer()).toEqual({ value: null, updatedAt: 108, rev: 8 })
      expect(warn).toHaveBeenCalledTimes(8)
      expect((await source.record("task", "bad-task"))).toEqual({
        value: null, updatedAt: 102, rev: 2, deleted: false,
      })
      expect(warn).toHaveBeenCalledTimes(9)
    } finally {
      warn.mockRestore()
    }
  })

  it("keeps record versions for empty and invalid JSON rows", async () => {
    const db = createTestD1()
    const insert = db.prepare(
      "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES ('project', ?, ?, ?, ?, 0, 'app')",
    )
    await insert.bind("empty", null, 201, 41).run()
    await insert.bind("broken", "{bad json", 202, 42).run()

    const source = createD1DataSource(db)
    expect(await source.record("project", "empty")).toEqual({ value: null, updatedAt: 201, rev: 41, deleted: false })
    expect(await source.record("project", "broken")).toEqual({ value: null, updatedAt: 202, rev: 42, deleted: false })
  })
})
