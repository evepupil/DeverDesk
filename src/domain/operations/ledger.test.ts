import { describe, expect, it } from "vitest"
import type { OpContext } from "./context"
import { newEntry, patchEntry, withEntryStatus } from "./ledger"
import type { EntryInput } from "./ledger"
import type { LedgerEntry } from "../types"

const ctx: OpContext = { now: 1_800_000_000_000, today: "2027-01-15", newId: (prefix) => `${prefix}-fixed` }
const input: EntryInput = {
  kind: "income",
  amount: 125,
  projectId: "p-1",
  category: "sales",
  channel: "bank",
  status: "pending",
  date: "2027-01-10",
  expectedOn: "2027-01-20",
  note: "Invoice",
}
const entry: LedgerEntry = { ...input, id: "L-1", createdAt: 20 }

describe("ledger operations", () => {
  it("newEntry adds an id and created timestamp without changing the input", () => {
    expect(newEntry(input, ctx)).toEqual({ ...input, id: "L-fixed", createdAt: ctx.now })
    expect(input).not.toHaveProperty("id")
  })

  it("patchEntry merges new fields and retains the original identity and creation time", () => {
    const next = patchEntry(entry, { ...input, amount: 200, note: "  Paid  " })
    expect(next).toMatchObject({ id: "L-1", createdAt: 20, amount: 200, note: "  Paid  " })
    expect(entry.amount).toBe(125)
  })

  it("withEntryStatus records today when pending income is received", () => {
    expect(withEntryStatus(entry, "received", ctx)).toMatchObject({
      status: "received",
      date: ctx.today,
      expectedOn: null,
    })
  })

  it("withEntryStatus preserves date and expected day while pending", () => {
    const pending = withEntryStatus(entry, "pending", ctx)
    expect(pending).toMatchObject({ status: "pending", date: "2027-01-10", expectedOn: "2027-01-20" })
  })

  it("withEntryStatus clears expected day for refunded entries", () => {
    expect(withEntryStatus(entry, "refunded", ctx)).toMatchObject({
      status: "refunded",
      date: "2027-01-10",
      expectedOn: null,
    })
  })
})
