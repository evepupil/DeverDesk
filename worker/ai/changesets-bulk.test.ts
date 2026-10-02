import { describe, expect, it } from "vitest"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { createChangesetService } from "./changesets"
import { change, NOW, proposeToken, submission, writeToken } from "./test-helpers"

interface Counts {
  direct: number
  batched: number
}

function countingDb(db: D1Database, counts: Counts): D1Database {
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property) {
        if (property === "bind") return (...values: unknown[]) => wrap(target.bind(...values))
        if (property === "first" || property === "all" || property === "run" || property === "raw") {
          return (...args: unknown[]) => {
            counts.direct += 1
            const method = Reflect.get(target, property) as (...parameters: unknown[]) => unknown
            return method.apply(target, args)
          }
        }
        const value: unknown = Reflect.get(target, property)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
  }

  return {
    prepare(sql: string) {
      return wrap(db.prepare(sql))
    },
    batch(statements: D1PreparedStatement[]) {
      counts.batched += statements.length
      return db.batch(statements)
    },
  } as unknown as D1Database
}

async function seedRateHistory(db: D1Database, tokenId: string): Promise<void> {
  for (let batch = 0; batch < 9; batch += 1) {
    const id = `cs_${String(batch).padStart(16, "0")}`
    await db.batch([
      db.prepare(
        "INSERT INTO ai_changesets (id, token_id, client_name, tool, status, created_at) VALUES (?, ?, 'Writer', 'test', 'applied', ?)"
      ).bind(id, tokenId, NOW),
      ...Array.from({ length: 20 }, (_, seq) => db.prepare(
        "INSERT INTO ai_changes (changeset_id, seq, kind, record_id, action, state) VALUES (?, ?, 'task', ?, 'create', 'applied')"
      ).bind(id, seq, `t-history-${batch}-${seq}`)),
    ])
  }
}

describe("ChangesetService bulk submissions", () => {
  it("applies 30 changes despite forcePreview and stays below 50 D1 statements", async () => {
    const db = createTestD1()
    const counts: Counts = { direct: 0, batched: 0 }
    const service = createChangesetService(countingDb(db, counts), () => NOW)
    const result = await service.submit(submission(writeToken, Array.from({ length: 30 }, (_, index) =>
      change({ id: `t-bulk-${index}` })
    ), { bulk: true, forcePreview: true, tool: "recorder" }))

    expect(result.status).toBe("applied")
    expect(result.results).toHaveLength(30)
    expect(result.results.every((item) => item.state === "applied")).toBe(true)
    expect(db.rows<{ status: string; tool: string }>(
      "SELECT status, tool FROM ai_changesets WHERE id = ?", result.changesetId,
    )).toEqual([{ status: "applied", tool: "recorder" }])
    expect(counts.direct + counts.batched).toBe(34)
    expect(counts.direct + counts.batched).toBeLessThan(50)
  })

  it("does not consume the token's normal rate allowance", async () => {
    const db = createTestD1()
    await seedRateHistory(db, writeToken.id)
    const service = createChangesetService(db, () => NOW)

    await service.submit(submission(writeToken, Array.from({ length: 30 }, (_, index) =>
      change({ id: `t-rate-bulk-${index}` })
    ), { bulk: true, tool: "recorder" }))
    const regular = await service.submit(submission(writeToken, Array.from({ length: 20 }, (_, index) =>
      change({ id: `t-rate-regular-${index}` })
    )))

    expect(regular.status).toBe("preview")
    await expect(service.submit(submission(writeToken, [change({ id: "t-rate-overflow" })])))
      .rejects.toMatchObject({ code: "rate_limited" })
  })

  it("rejects 31 changes and all non-write tiers", async () => {
    const db = createTestD1()
    const service = createChangesetService(db, () => NOW)

    await expect(service.submit(submission(writeToken, Array.from({ length: 31 }, (_, index) =>
      change({ id: `t-too-many-bulk-${index}` })
    ), { bulk: true }))).rejects.toMatchObject({ code: "too_many" })
    await expect(service.submit(submission(proposeToken, [change()], { bulk: true })))
      .rejects.toMatchObject({ code: "forbidden" })
  })
})
