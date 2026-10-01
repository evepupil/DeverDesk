import { afterAll, describe, expect, it, vi } from "vitest"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { createToken } from "../db/tokens"
import { dispatchApi } from "./index"
import { getSummary } from "./operations"
import type { WorkerEnv } from "../types"
import { seedRecord } from "../ai/test-helpers"

vi.stubEnv("TZ", "UTC")
afterAll(() => vi.unstubAllEnvs())

const envFor = (DB: D1Database) => ({ DB }) as WorkerEnv

async function seedRateWindow(db: D1Database, tokenId: string): Promise<void> {
  const createdAt = Date.now()
  await db.prepare("INSERT INTO settings (key, value) VALUES ('ai_cleanup_at', ?)")
    .bind(`${createdAt}:test`).run()
  for (let batch = 0; batch < 10; batch += 1) {
    const id = `cs_${String(batch).padStart(16, "0")}`
    const statements = [
      db.prepare(
        "INSERT INTO ai_changesets (id, token_id, client_name, tool, status, created_at) VALUES (?, ?, ?, ?, 'applied', ?)"
      ).bind(id, tokenId, "Rate test", "test", createdAt),
      ...Array.from({ length: 20 }, (_, seq) => db.prepare(
        "INSERT INTO ai_changes (changeset_id, seq, kind, record_id, action, state) VALUES (?, ?, 'task', ?, 'create', 'applied')"
      ).bind(id, seq, `t-rate-${batch}-${seq}`)),
    ]
    await db.batch(statements)
  }
}

describe("operation changeset business errors", () => {
  it.each([
    { path: "tasks", body: { title: "Rate limited task" } },
    { path: "ledger", body: { kind: "income", amount: 1 } },
  ])("maps rate limits for /api/$path", async ({ path, body }) => {
    const db = createTestD1()
    const token = await createToken(db, "Rate limited writer", "write")
    await seedRateWindow(db, token.id)
    const context = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
    const response = await dispatchApi(new Request(`https://example.test/api/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), envFor(db), context)

    expect(response.status).toBe(429)
    const result = await response.json() as { error: string; retryAfter: number }
    expect(result.error).toBe("改动太频繁，请稍后再试")
    expect(result.retryAfter).toBeGreaterThan(0)
    expect(result.retryAfter).toBeLessThanOrEqual(600)
  })
})

describe("GET /api/summary monthly queries", () => {
  it("filters by the requested month in the profile time zone with four statements", async () => {
    const db = createTestD1()
    await seedRecord(db, "profile", "singleton", { timeZone: "America/Los_Angeles" }, 1, 1)
    const ledger = (id: string, date: string, kind: "income" | "expense", amount: number) => ({
      id, date, kind, amount, status: "received", projectId: null, category: kind === "income" ? "sales" : "server",
      channel: "bank", expectedOn: null, note: "", createdAt: 1,
    })
    await seedRecord(db, "ledger", "L-in-month", ledger("L-in-month", "2025-12-01", "income", 40), 1, 2)
    await seedRecord(db, "ledger", "L-out-month", ledger("L-out-month", "2025-11-30", "expense", 900), 1, 3)
    await seedRecord(db, "ledger", "L-expense", ledger("L-expense", "2025-12-31", "expense", 10), 1, 4)
    const timeEntry = (id: string, start: number, end: number) => ({ id, start, end, taskId: null, projectId: null })
    await seedRecord(db, "entry", "E-first", timeEntry("E-first", Date.parse("2025-12-01T08:00:00Z"), Date.parse("2025-12-01T08:30:00Z")), 1, 5)
    await seedRecord(db, "entry", "E-last-day", timeEntry("E-last-day", Date.parse("2026-01-01T07:30:00Z"), Date.parse("2026-01-01T08:30:00Z")), 1, 6)
    await seedRecord(db, "entry", "E-next-month", timeEntry("E-next-month", Date.parse("2026-01-01T08:00:00Z"), Date.parse("2026-01-01T08:30:00Z")), 1, 7)
    const task = (id: string, completedAt: number) => ({ id, status: "done", completedAt })
    await seedRecord(db, "task", "T-first", task("T-first", Date.parse("2025-12-01T08:00:00Z")), 1, 8)
    await seedRecord(db, "task", "T-last-day", task("T-last-day", Date.parse("2026-01-01T07:30:00Z")), 1, 9)
    await seedRecord(db, "task", "T-next-month", task("T-next-month", Date.parse("2026-01-01T08:00:00Z")), 1, 10)

    let statements = 0
    const countingDb = {
      prepare(sql: string) {
        statements += 1
        return db.prepare(sql)
      },
    } as unknown as D1Database
    const response = await getSummary(new Request("https://example.test/api/summary?month=2025-12"), envFor(countingDb))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ month: "2025-12", income: 40, expense: 10, net: 30, minutes: 90, doneTasks: 2 })
    expect(statements).toBe(4)
  })
})
