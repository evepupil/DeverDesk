import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import { patchNote } from "../../../../src/domain/operations"
import type { WeekNote } from "../../../../src/domain/types"
import { writeWeekNotesTool } from "./write-week-notes"
import { captureContext } from "./test-support"
import { emptyWorkbench } from "./helpers"

beforeAll(() => {
  process.env.TZ = "UTC"
})

const note: WeekNote = {
  week: "2026-09-28",
  wins: "Shipped the first draft.",
  improve: "Leave more review time.",
  next: "Finish onboarding.",
}

describe("write_week_notes", () => {
  it("appends provided fields through the shared note operation and preserves omitted fields", async () => {
    const ctx = captureContext(emptyWorkbench({ notes: [note] }), {
      versions: { "note:2026-09-28": { updatedAt: 501, rev: 19 } },
    })
    const plan = await writeWeekNotesTool.plan(ctx, {
      week: "2026-10-02",
      wins: "Closed the remaining issue.",
      mode: "append",
      reason: "Add the final win.",
    })
    const direct = patchNote(note, "2026-09-28", {
      wins: "Shipped the first draft.\nClosed the remaining issue.",
    })

    expect(plan.changes).toEqual([{
      kind: "note",
      id: "2026-09-28",
      action: "update",
      before: note,
      beforeUpdatedAt: 501,
      beforeRev: 19,
      after: direct,
    }])
    expect(plan.output).toEqual(direct)
    expect(plan.reason).toBe("Add the final win.")
  })

  it("creates a note for the containing Monday and returns no changes for an empty patch", async () => {
    const ctx = captureContext()
    const plan = await writeWeekNotesTool.plan(ctx, { week: "2026-10-04", next: "Ship the update." })
    expect(plan.changes).toEqual([{
      kind: "note",
      id: "2026-09-28",
      action: "create",
      before: null,
      beforeUpdatedAt: null,
      beforeRev: null,
      after: { week: "2026-09-28", wins: "", improve: "", next: "Ship the update." },
    }])
    expect(plan.output).toEqual({ week: "2026-09-28", wins: "", improve: "", next: "Ship the update." })

    const empty = await writeWeekNotesTool.plan(ctx, { week: "2026-10-04" })
    expect(empty.changes).toEqual([])
  })
})
