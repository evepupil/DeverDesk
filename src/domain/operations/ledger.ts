import type { LedgerEntry } from "../types"
import type { OpContext } from "./context"

export type EntryInput = Omit<LedgerEntry, "id" | "createdAt">

export function newEntry(input: EntryInput, ctx: OpContext): LedgerEntry {
  return { ...input, id: ctx.newId("L"), createdAt: ctx.now }
}

export function patchEntry(entry: LedgerEntry, input: EntryInput): LedgerEntry {
  return { ...entry, ...input }
}

export function withEntryStatus(
  entry: LedgerEntry,
  status: LedgerEntry["status"],
  ctx: OpContext
): LedgerEntry {
  return {
    ...entry,
    status,
    date: status === "received" && entry.status === "pending" ? ctx.today : entry.date,
    expectedOn: status === "pending" ? entry.expectedOn : null,
  }
}
