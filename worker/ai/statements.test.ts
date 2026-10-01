import { describe, expect, it } from "vitest"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { createChangesetService } from "./changesets"
import { change, NOW, proposeToken, submission, writeToken } from "./test-helpers"

type Counts = { prepared: number; batchStatements: number }

function countingDb(db: D1Database, counts: Counts): D1Database {
  return {
    prepare(sql: string) {
      counts.prepared += 1
      return db.prepare(sql)
    },
    batch(statements: D1PreparedStatement[]) {
      counts.batchStatements += statements.length
      return db.batch(statements)
    },
  } as unknown as D1Database
}

function reset(counts: Counts): void {
  counts.prepared = 0
  counts.batchStatements = 0
}

describe("changeset D1 statement budgets", () => {
  it("measures submit, transition, undo, and list operations", async () => {
    const db = createTestD1()
    await db.prepare("INSERT INTO settings (key, value) VALUES ('ai_cleanup_at', ?)")
      .bind(`${NOW}:seed`).run()
    const counts: Counts = { prepared: 0, batchStatements: 0 }
    const service = createChangesetService(countingDb(db, counts), () => NOW)

    const proposal = await service.submit(submission(proposeToken, [change({ id: "t-accept" })]))
    expect(counts).toEqual({ prepared: 4, batchStatements: 2 })

    reset(counts)
    const accepted = await service.accept(proposal.changesetId!)
    expect(accepted.changeset.status).toBe("applied")
    expect(counts).toEqual({ prepared: 8, batchStatements: 4 })

    reset(counts)
    const preview = await service.submit(submission(writeToken, [change({ id: "t-confirm" })], { forcePreview: true }))
    expect(counts).toEqual({ prepared: 4, batchStatements: 2 })
    reset(counts)
    const confirmed = await service.confirm(writeToken, preview.changesetId!)
    expect(confirmed.changeset.status).toBe("applied")
    expect(counts).toEqual({ prepared: 8, batchStatements: 4 })

    reset(counts)
    const rejectedProposal = await service.submit(submission(proposeToken, [change({ id: "t-reject" })]))
    reset(counts)
    await service.reject(rejectedProposal.changesetId!)
    expect(counts).toEqual({ prepared: 4, batchStatements: 1 })

    reset(counts)
    const immediate = await service.submit(submission(writeToken, [change({ id: "t-undo" })]))
    expect(counts).toEqual({ prepared: 7, batchStatements: 4 })
    reset(counts)
    const undone = await service.undo(writeToken, immediate.changesetId!, undefined)
    expect(undone.changeset.status).toBe("undone")
    expect(counts).toEqual({ prepared: 10, batchStatements: 5 })

    reset(counts)
    const withdrawal = await service.submit(submission(proposeToken, [change({ id: "t-withdraw" })]))
    reset(counts)
    await service.withdraw(proposeToken, withdrawal.changesetId!)
    expect(counts).toEqual({ prepared: 4, batchStatements: 1 })

    reset(counts)
    const listing = await service.list({ status: "all", limit: 20 })
    expect(listing.changesets.length).toBeGreaterThan(0)
    expect(counts).toEqual({ prepared: 4, batchStatements: 0 })
  })
})
