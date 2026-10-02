import { describe, expect, it } from "vitest"
import { getT } from "../i18n/runtime"
import { MILESTONE_TITLE_MAX, validateMilestone } from "./validation"

describe("validateMilestone", () => {
  const t = getT()
  const label = t.projects.sheet.milestoneLabel

  it("accepts a title within the limit and a chosen date", () => {
    expect(validateMilestone("Release", "2027-02-01")).toEqual({})
    expect(validateMilestone("M".repeat(MILESTONE_TITLE_MAX), "2027-02-01")).toEqual({})
  })

  it("requires a title and ignores surrounding spaces when counting", () => {
    expect(validateMilestone("", "2027-02-01")).toEqual({ title: t.forms.validation.required(label) })
    expect(validateMilestone("   ", "2027-02-01")).toEqual({ title: t.forms.validation.required(label) })
    expect(validateMilestone(` ${"M".repeat(MILESTONE_TITLE_MAX)} `, "2027-02-01")).toEqual({})
  })

  it("rejects a title that is one character too long", () => {
    expect(validateMilestone("M".repeat(MILESTONE_TITLE_MAX + 1), "2027-02-01")).toEqual({
      title: t.forms.validation.tooLong(label, MILESTONE_TITLE_MAX),
    })
  })

  it("requires a target date and reports it separately from the title", () => {
    expect(validateMilestone("Release", "")).toEqual({ due: t.forms.validation.date })
    expect(validateMilestone("", "")).toEqual({ title: t.forms.validation.required(label), due: t.forms.validation.date })
  })
})
