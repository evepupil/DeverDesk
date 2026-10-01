import { describe, expect, it } from "vitest"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { createChangesetService } from "./changesets"
import { change, NOW, proposeToken, readRecord, seedRecord, submission, writeToken } from "./test-helpers"

describe("ChangesetService submit and apply", () => {
  it("supports proposed, preview, and immediate write paths with API revisions", async () => {
    const db = createTestD1()
    const service = createChangesetService(db, () => NOW)

    const proposal = await service.submit(submission(proposeToken, [change({ id: "t-proposed" })]))
    expect(proposal.status).toBe("proposed")
    expect(readRecord(db, "task", "t-proposed")).toBeUndefined()
    const accepted = await service.accept(proposal.changesetId!)
    expect(accepted.changeset.status).toBe("applied")
    expect(readRecord(db, "task", "t-proposed")).toMatchObject({ updated_at: NOW, rev: 1, source: "api", deleted: 0 })

    const preview = await service.submit(submission(writeToken, [change({ id: "t-preview" })], { forcePreview: true }))
    expect(preview.status).toBe("preview")
    expect(readRecord(db, "task", "t-preview")).toBeUndefined()
    const confirmed = await service.confirm(writeToken, preview.changesetId!)
    expect(confirmed.changeset.status).toBe("applied")
    expect(readRecord(db, "task", "t-preview")?.source).toBe("api")

    const direct = await service.submit(submission(writeToken, [
      change({ id: "t-seq-a", after: { id: "t-seq-a", seq: 0, title: "A" } }),
      change({ id: "t-seq-b", after: { id: "t-seq-b", seq: 0, title: "B" } }),
    ]))
    expect(direct.status).toBe("applied")
    expect(direct.results.map((result) => (result.after as { seq: number }).seq)).toEqual([103, 104])
    expect(readRecord(db, "task", "t-seq-a")?.value).toMatchObject({ seq: 103 })
    expect(readRecord(db, "task", "t-seq-b")?.value).toMatchObject({ seq: 104 })
    expect(db.rows<{ decided_at: number | null; token_id: string | null }>(
      "SELECT decided_at, token_id FROM ai_changesets WHERE id = ?", direct.changesetId,
    )).toEqual([{ decided_at: NOW, token_id: "tok-write" }])
  })

  it("applies a new entry and timer deletion directly for write-tier submissions", async () => {
    const db = createTestD1()
    const service = createChangesetService(db, () => NOW)
    const timer = { taskId: "t-running", startedAt: NOW - 60_000 }
    await seedRecord(db, "timer", "singleton", timer, NOW - 60_000, 1)

    const result = await service.submit(submission(writeToken, [
      change({ kind: "entry", id: "e-timer-stop", after: { id: "e-timer-stop", start: NOW - 60_000, end: NOW } }),
      change({
        kind: "timer", id: "singleton", action: "delete", before: timer,
        beforeUpdatedAt: NOW - 60_000, beforeRev: 1, after: null,
      }),
    ]))

    expect(result.status).toBe("applied")
    expect(result.results.map((item) => item.state)).toEqual(["applied", "applied"])
    expect(readRecord(db, "entry", "e-timer-stop")).toMatchObject({ deleted: 0, source: "api" })
    expect(readRecord(db, "timer", "singleton")).toMatchObject({ deleted: 1, source: "api", rev: 3 })
  })

  it("uses beforeRev for conflicts, applies unaffected proposal rows, and preserves submitted content", async () => {
    const db = createTestD1()
    await seedRecord(db, "task", "t-old", { id: "t-old", title: "before", seq: 101 }, 10, 1)
    const service = createChangesetService(db, () => NOW)
    const submitted = await service.submit(submission(proposeToken, [
      change({ id: "t-old", action: "update", before: { id: "t-old", title: "before", seq: 101 }, beforeUpdatedAt: 10, beforeRev: 1,
        after: { id: "t-old", title: "AI", seq: 101, completedAt: NOW } }),
      change({ id: "t-new", after: { id: "t-new", seq: 0, title: "new" } }),
    ]))
    await db.prepare("UPDATE records SET data = ?, updated_at = ?, rev = ?, source = 'app' WHERE kind = 'task' AND id = ?")
      .bind(JSON.stringify({ id: "t-old", title: "browser", seq: 101 }), NOW + 5, 2, "t-old").run()

    const accepted = await service.accept(submitted.changesetId!)
    expect(accepted.conflicts).toEqual([0])
    expect(accepted.changeset.changes.map((row) => row.state)).toEqual(["conflict", "applied"])
    expect(readRecord(db, "task", "t-old")?.value).toMatchObject({ title: "browser" })
    expect(readRecord(db, "task", "t-new")?.value).toMatchObject({ title: "new", seq: 102 })
    expect(accepted.changeset.changes[0].after).toMatchObject({ completedAt: NOW })
  })

  it("makes accept/reject state transitions atomic and does not apply twice", async () => {
    const db = createTestD1()
    const service = createChangesetService(db, () => NOW)
    const rejected = await service.submit(submission(proposeToken, [change({ id: "t-rejected" })]))
    await service.reject(rejected.changesetId!)
    await expect(service.accept(rejected.changesetId!)).rejects.toMatchObject({ code: "wrong_status" })
    expect(readRecord(db, "task", "t-rejected")).toBeUndefined()

    const accepted = await service.submit(submission(proposeToken, [change({ id: "t-accepted" })]))
    await service.accept(accepted.changesetId!)
    await expect(service.accept(accepted.changesetId!)).rejects.toMatchObject({ code: "wrong_status" })
    expect(readRecord(db, "task", "t-accepted")).toMatchObject({ rev: 1, source: "api" })
  })

  it("keeps a 20-change write within the D1 statement budget", async () => {
    const db = createTestD1()
    const service = createChangesetService(db, () => NOW)
    const submitted = await service.submit(submission(proposeToken, Array.from({ length: 20 }, (_, index) =>
      change({ id: `t-batch-${index}` })
    )))
    let prepared = 0
    const countingDb = {
      prepare(sql: string) {
        prepared += 1
        return db.prepare(sql)
      },
      batch(statements: D1PreparedStatement[]) { return db.batch(statements) },
    } as unknown as D1Database
    const countingService = createChangesetService(countingDb, () => NOW)
    const result = await countingService.accept(submitted.changesetId!)
    expect(result.changeset.changes).toHaveLength(20)
    expect(prepared).toBeLessThanOrEqual(45)
  })
})
