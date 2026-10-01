import { describe, expect, it } from "vitest"
import { patchNote } from "./notes"
import type { WeekNote } from "../types"

const week = "2027-01-11"

describe("patchNote", () => {
  it("creates an empty note for a week and applies the supplied fields", () => {
    expect(patchNote(null, week, { wins: "Shipped", next: "Review" })).toEqual({
      week,
      wins: "Shipped",
      improve: "",
      next: "Review",
    })
  })

  it("merges a partial update without clearing other sections", () => {
    const note: WeekNote = { week, wins: "Shipped", improve: "Tests", next: "Review" }
    expect(patchNote(note, week, { improve: "More tests" })).toEqual({
      week,
      wins: "Shipped",
      improve: "More tests",
      next: "Review",
    })
    expect(note.improve).toBe("Tests")
  })
})
