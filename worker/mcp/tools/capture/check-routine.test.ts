import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import { isDone, toggleDone } from "../../../../src/domain/routines"
import type { Routine } from "../../../../src/domain/types"
import { checkRoutineTool } from "./check-routine"
import { captureContext } from "./test-support"
import { emptyWorkbench } from "./helpers"

beforeAll(() => {
  process.env.TZ = "UTC"
})

const routine: Routine = {
  id: "r-weekly",
  title: "Weekly review",
  cadence: "weekly",
  estimateMin: 20,
  projectId: null,
  doneOn: ["2026-10-01"],
  createdOn: "2026-01-01",
  archived: false,
}

describe("check_routine", () => {
  it("uses the shared period toggle and includes the updated status", async () => {
    const ctx = captureContext(emptyWorkbench({ routines: [routine] }), {
      versions: { "routine:r-weekly": { updatedAt: 901, rev: 23 } },
    })
    const plan = await checkRoutineTool.plan(ctx, { routine: "weekly review", date: "2026-10-02", done: false, reason: "Undo this check-in." })
    const direct = toggleDone(routine, "2026-10-02")

    expect(isDone(routine, "2026-10-02")).toBe(true)
    expect(plan.changes).toEqual([{
      kind: "routine",
      id: "r-weekly",
      action: "update",
      before: routine,
      beforeUpdatedAt: 901,
      beforeRev: 23,
      after: direct,
    }])
    expect(plan.output).toMatchObject({
      date: "2026-10-02",
      done: false,
      routine: { id: "r-weekly", title: "Weekly review" },
    })
    expect(plan.reason).toBe("Undo this check-in.")
  })

  it("returns no changes when the routine is already at the requested state", async () => {
    const notDone = { ...routine, doneOn: [] }
    const ctx = captureContext(emptyWorkbench({ routines: [notDone] }))
    const plan = await checkRoutineTool.plan(ctx, { routine: "r-weekly", done: false })
    expect(plan.changes).toEqual([])
    expect(plan.output).toMatchObject({ date: "2026-10-02", done: false })
  })
})
