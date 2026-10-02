import { describe, expect, it } from "vitest"
import { ChangesetError, MAX_CHANGES_PER_CALL } from "../mcp/types"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { createChangesetService } from "./changesets"
import { change, NOW, proposeToken, readRecord, seedRecord, submission, writeToken } from "./test-helpers"

describe("ChangesetService decisions and undo", () => {
  it("undoes create, update, and delete in reverse order and restores previous rows", async () => {
    const db = createTestD1()
    await seedRecord(db, "task", "t-update", { id: "t-update", title: "old" }, 12, 1)
    await seedRecord(db, "ledger", "L-delete", { id: "L-delete", amount: 5 }, 13, 2)
    const service = createChangesetService(db, () => NOW)
    const submitted = await service.submit(submission(writeToken, [
      change({ id: "t-update", action: "update", before: { id: "t-update", title: "old" }, beforeUpdatedAt: 12, beforeRev: 1,
        after: { id: "t-update", title: "new" } }),
      change({ kind: "ledger", id: "L-delete", action: "delete", before: { id: "L-delete", amount: 5 }, beforeUpdatedAt: 13, beforeRev: 2, after: null }),
      change({ kind: "entry", id: "E-create", after: { id: "E-create", start: 1, end: 2 } }),
    ]))
    const applied = submitted.status === "preview"
      ? await service.confirm(writeToken, submitted.changesetId!)
      : null
    expect(applied?.changeset.status ?? submitted.status).toBe("applied")
    const undone = await service.undo(writeToken, submitted.changesetId!)
    expect(undone.changeset.status).toBe("undone")
    expect(readRecord(db, "task", "t-update")).toMatchObject({ value: { title: "old" }, deleted: 0, source: "api" })
    expect(readRecord(db, "ledger", "L-delete")).toMatchObject({ value: { amount: 5 }, deleted: 0 })
    expect(readRecord(db, "entry", "E-create")).toMatchObject({ value: null, deleted: 1 })
    await expect(service.undo(writeToken, submitted.changesetId!)).rejects.toMatchObject({ code: "wrong_status" })
  })

  it("skips recorder changesets when choosing the newest unnumbered undo", async () => {
    const db = createTestD1()
    let clock = NOW
    const service = createChangesetService(db, () => clock)
    const ordinary = await service.submit(submission(writeToken, [change({ id: "t-ordinary" })]))
    clock += 1
    const recorder = await service.submit(submission(writeToken, [change({ id: "t-recorder" })], {
      tool: "recorder", bulk: true,
    }))

    const undone = await service.undo(writeToken)
    expect(undone.changeset.id).toBe(ordinary.changesetId)
    expect(undone.changeset.status).toBe("undone")
    expect(db.rows<{ deleted: number }>("SELECT deleted FROM records WHERE kind = 'task' AND id = 't-recorder'")[0]?.deleted).toBe(0)
    expect(recorder.status).toBe("applied")
  })

  it("supports partial undo without applying the same sequence twice", async () => {
    const db = createTestD1()
    const service = createChangesetService(db, () => NOW)
    const submitted = await service.submit(submission(writeToken, [change({ id: "t-part-a" }), change({ id: "t-part-b" })]))
    const first = await service.undo(writeToken, submitted.changesetId!, [0])
    expect(first.changeset.status).toBe("applied")
    expect(first.changeset.changes.map((row) => row.state)).toEqual(["undone", "applied"])
    const revAfterFirst = readRecord(db, "task", "t-part-a")?.rev
    await expect(service.undo(writeToken, submitted.changesetId!, [0])).rejects.toMatchObject({ code: "wrong_status" })
    expect(readRecord(db, "task", "t-part-a")?.rev).toBe(revAfterFirst)
    const second = await service.undo(writeToken, submitted.changesetId!)
    expect(second.changeset.status).toBe("undone")
  })

  it("marks undo conflicts when someone wrote a newer record", async () => {
    const db = createTestD1()
    const service = createChangesetService(db, () => NOW)
    const submitted = await service.submit(submission(writeToken, [change({ id: "t-human" })]))
    await db.prepare("UPDATE records SET rev = rev + 1, source = 'app' WHERE kind = 'task' AND id = ?").bind("t-human").run()
    const result = await service.undo(writeToken, submitted.changesetId!)
    expect(result.conflicts).toEqual([0])
    expect(result.changeset.status).toBe("applied")
    expect(result.changeset.changes[0].state).toBe("conflict")
  })

  it("enforces ownership, tier, preview expiry, withdraw, and reject states", async () => {
    const db = createTestD1()
    let clock = NOW
    const service = createChangesetService(db, () => clock)
    const preview = await service.submit(submission(writeToken, [change({ id: "t-private-preview" })], { forcePreview: true }))
    await expect(service.confirm({ id: "other", name: "Other", tier: "write" }, preview.changesetId!))
      .rejects.toMatchObject({ code: "forbidden" })
    const proposal = await service.submit(submission(proposeToken, [change({ id: "t-withdraw" })]))
    await expect(service.withdraw(writeToken, proposal.changesetId!)).rejects.toMatchObject({ code: "forbidden" })
    expect((await service.withdraw(proposeToken, proposal.changesetId!)).changeset.status).toBe("withdrawn")
    await expect(service.reject(proposal.changesetId!)).rejects.toMatchObject({ code: "wrong_status" })

    clock += 15 * 60 * 1000 + 1
    await expect(service.confirm(writeToken, preview.changesetId!)).rejects.toMatchObject({ code: "expired" })
    expect(db.rows<{ status: string }>("SELECT status FROM ai_changesets WHERE id = ?", preview.changesetId)[0].status).toBe("expired")
    await expect(service.submit(submission({ ...writeToken, tier: "read" }, [change()]))).rejects.toMatchObject({ code: "forbidden" })
  })

  it("limits 200 changes per token in ten minutes and clears old packages", async () => {
    const db = createTestD1()
    let clock = NOW
    const service = createChangesetService(db, () => clock)
    for (let batch = 0; batch < 10; batch += 1) {
      const changes = Array.from({ length: 20 }, (_, index) => change({ id: `t-rate-${batch}-${index}` }))
      await service.submit(submission(proposeToken, changes))
    }
    await expect(service.submit(submission(proposeToken, [change({ id: "t-rate-over" })])))
      .rejects.toMatchObject({ code: "rate_limited", retryAfter: 600 })
    clock += 10 * 60 * 1000 + 1
    expect((await service.submit(submission(proposeToken, [change({ id: "t-rate-allowed" })]))).status).toBe("proposed")

    clock += 31 * 24 * 60 * 60 * 1000
    const staleId = `cs_${"a".repeat(16)}`
    const expiredPreviewId = `cs_${"b".repeat(16)}`
    const oldCreatedAt = clock - 31 * 24 * 60 * 60 * 1000
    await db.prepare(
      "INSERT INTO ai_changesets (id, token_id, client_name, tool, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(staleId, "old-token", "Old", "test", "rejected", oldCreatedAt).run()
    await db.prepare("INSERT INTO ai_changes (changeset_id, seq, kind, record_id, action, state) VALUES (?, 0, 'task', 'old', 'create', 'pending')")
      .bind(staleId).run()
    await db.prepare(
      "INSERT INTO ai_changesets (id, token_id, client_name, tool, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(expiredPreviewId, "old-token", "Old", "test", "preview", clock - 16 * 60 * 1000).run()
    await db.prepare("INSERT INTO ai_changes (changeset_id, seq, kind, record_id, action, state) VALUES (?, 0, 'task', 'preview', 'create', 'pending')")
      .bind(expiredPreviewId).run()
    const listed = await service.list({ status: "all", limit: 10 })
    expect(listed.changesets.some((changeset) => changeset.id === staleId)).toBe(false)
    expect(db.rows("SELECT * FROM ai_changes WHERE changeset_id = ?", staleId)).toEqual([])
    expect(db.rows<{ status: string }>("SELECT status FROM ai_changesets WHERE id = ?", expiredPreviewId)[0].status).toBe("expired")
    expect(listed.changesets.find((changeset) => changeset.id === expiredPreviewId)?.status).toBe("expired")
  })

  it("rejects over-sized plans before any changes are stored", async () => {
    const db = createTestD1()
    const service = createChangesetService(db, () => NOW)
    const changes = Array.from({ length: MAX_CHANGES_PER_CALL + 1 }, (_, index) => change({ id: `t-too-many-${index}` }))
    await expect(service.submit(submission(writeToken, changes))).rejects.toBeInstanceOf(ChangesetError)
    expect(db.rows("SELECT id FROM ai_changesets")).toEqual([])
  })
})
