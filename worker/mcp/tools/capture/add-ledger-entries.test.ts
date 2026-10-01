import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import type { LedgerEntry } from "../../../../src/domain/types"
import { addLedgerEntriesTool } from "./add-ledger-entries"
import { captureContext } from "./test-support"
import { emptyWorkbench } from "./helpers"

beforeAll(() => {
  process.env.TZ = "UTC"
})

const priorExternal: LedgerEntry = {
  id: "ledger-order",
  kind: "income",
  amount: 90,
  projectId: null,
  category: "sales",
  channel: "bank",
  status: "received",
  date: "2026-10-01",
  expectedOn: null,
  note: "Paid",
  createdAt: 10,
  externalId: "order-7",
}

const priorSameDay: LedgerEntry = {
  id: "ledger-expense",
  kind: "expense",
  amount: 12.5,
  projectId: null,
  category: "tools",
  channel: "card",
  status: "received",
  date: "2026-10-02",
  expectedOn: null,
  note: "Tool",
  createdAt: 11,
}

describe("add_ledger_entries", () => {
  it("skips duplicate external ids and same-day matches, then creates the remaining entries", async () => {
    const ctx = captureContext(
      emptyWorkbench({ ledger: [priorExternal, priorSameDay] }),
      { versions: { "ledger:ledger-order": { updatedAt: 700, rev: 17 }, "ledger:ledger-expense": { updatedAt: 701, rev: 18 } } },
      (prefix, index) => `${prefix}-created-${index}`
    )
    const plan = await addLedgerEntriesTool.plan(ctx, {
      entries: [
        { kind: "expense", amount: 20, date: "2026-10-02", externalId: " order-7 " },
        { kind: "expense", amount: 12.5, date: "2026-10-02" },
        { kind: "income", amount: 25.75, date: "2026-10-02", status: "pending", expectedOn: "2026-10-08" },
      ],
      reason: "Record the new invoice.",
    })

    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]).toMatchObject({
      kind: "ledger",
      id: "L-created-0",
      action: "create",
      before: null,
      beforeUpdatedAt: null,
      beforeRev: null,
      after: {
        kind: "income",
        amount: 25.75,
        category: "other-income",
        channel: "platform",
        status: "pending",
        date: "2026-10-02",
        expectedOn: "2026-10-08",
        origin: "ai",
      },
    })
    expect(plan.output).toMatchObject({
      created: [{ id: "L-created-0", kind: "income", amount: 25.75, byAi: true }],
      skipped: [
        { index: 0, existingId: "ledger-order", reason: expect.stringContaining("external id") },
        { index: 1, existingId: "ledger-expense", reason: expect.stringContaining("same-day") },
      ],
    })
    expect(plan.reason).toBe("Record the new invoice.")
  })

  it("skips repeated external ids within the same batch", async () => {
    const ctx = captureContext(emptyWorkbench(), {}, (prefix, index) => `${prefix}-batch-${index}`)
    const plan = await addLedgerEntriesTool.plan(ctx, {
      entries: [
        { kind: "income", amount: 8, date: "2026-10-02", externalId: "batch-order" },
        { kind: "income", amount: 9, date: "2026-10-02", externalId: "batch-order" },
      ],
      allowDuplicates: true,
    })
    expect(plan.changes).toHaveLength(1)
    expect(plan.output).toMatchObject({
      created: [{ id: "L-batch-0" }],
      skipped: [{ index: 1, duplicateOf: 0, reason: expect.stringContaining("same external id") }],
    })
  })

  it("allows explicit duplicates and applies defaults", async () => {
    const ctx = captureContext(emptyWorkbench({ ledger: [priorSameDay, priorExternal] }), {}, (prefix, index) => `${prefix}-allowed-${index}`)
    const plan = await addLedgerEntriesTool.plan(ctx, {
      entries: [
        { kind: "expense", amount: 12.5, date: "2026-10-02" },
        { kind: "expense", amount: 15, date: "2026-10-02", externalId: "order-7" },
      ],
      allowDuplicates: true,
    })
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0].after).toMatchObject({
      id: "L-allowed-0",
      category: "other-expense",
      channel: "platform",
      status: "received",
      expectedOn: null,
      origin: "ai",
    })
    expect(plan.output).toMatchObject({
      created: [{ id: "L-allowed-0" }],
      skipped: [{ index: 1, existingId: "ledger-order", reason: expect.stringContaining("external id") }],
    })
  })

  it("rejects pending expenses and accepts cent precision at large amounts", async () => {
    const ctx = captureContext(emptyWorkbench(), {}, (prefix) => `${prefix}-amount`)
    await expect(addLedgerEntriesTool.plan(ctx, {
      entries: [{ kind: "expense", amount: 5, status: "pending" }],
    })).rejects.toThrow('entries[0].status cannot be "pending" for an expense.')

    const plan = await addLedgerEntriesTool.plan(ctx, {
      entries: [{ kind: "income", amount: 1048792.37 }],
    })
    expect(plan.changes[0].after).toMatchObject({ amount: 1048792.37 })
    expect(plan.output).toMatchObject({ created: [{ amount: 1048792.37 }] })
  })
})
