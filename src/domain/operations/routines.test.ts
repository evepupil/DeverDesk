import { describe, expect, it } from "vitest"
import type { OpContext } from "./context"
import { archiveRoutine, newRoutine, patchRoutine, restoreRoutine } from "./routines"
import type { RoutineInput } from "./routines"
import type { Routine } from "../types"

const ctx: OpContext = { now: 1_800_000_000_000, today: "2027-01-15", newId: (prefix) => `${prefix}-fixed` }
const input: RoutineInput = { title: "  Write  ", cadence: "weekdays", estimateMin: 20, projectId: "p-1" }
const routine: Routine = {
  id: "r-1",
  title: "Read",
  cadence: "daily",
  estimateMin: 30,
  projectId: null,
  doneOn: ["2027-01-14"],
  createdOn: "2027-01-01",
  archived: false,
}

describe("routine operations", () => {
  it("newRoutine trims its title and initializes tracking fields", () => {
    expect(newRoutine(input, ctx)).toEqual({
      ...input,
      title: "Write",
      id: "r-fixed",
      doneOn: [],
      createdOn: ctx.today,
      archived: false,
    })
  })

  it("patchRoutine trims its title and preserves progress and identity", () => {
    const next = patchRoutine(routine, input)
    expect(next).toMatchObject({ id: "r-1", title: "Write", cadence: "weekdays", createdOn: "2027-01-01" })
    expect(next.doneOn).toEqual(["2027-01-14"])
  })

  it("archiveRoutine sets archived without changing completion dates", () => {
    expect(archiveRoutine(routine)).toMatchObject({ id: "r-1", archived: true, doneOn: ["2027-01-14"] })
  })

  it("restoreRoutine clears archived", () => {
    expect(restoreRoutine({ ...routine, archived: true })).toMatchObject({ id: "r-1", archived: false })
  })
})
