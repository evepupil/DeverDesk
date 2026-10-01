import { describe, expect, it } from "vitest"
import type { OpContext } from "./context"
import { addMilestone, newProject, patchProject, removeMilestone, toggleMilestone, updateMilestone } from "./projects"
import type { ProjectInput } from "./projects"
import type { Project } from "../types"

const ctx: OpContext = { now: 1_800_000_000_000, today: "2027-01-15", newId: (prefix) => `${prefix}-fixed` }
const input: ProjectInput = { name: "  Launch  ", color: "teal", stage: "building", goal: "Ship v1", monthlyTarget: 800 }
const project: Project = {
  id: "p-1",
  name: "Launch",
  color: "blue",
  stage: "idea",
  goal: "",
  startedOn: "2027-01-01",
  monthlyTarget: null,
  milestones: [
    { id: "m-1", title: "First", due: "2027-02-01", doneOn: null },
    { id: "m-2", title: "Second", due: "2027-03-01", doneOn: "2027-01-10" },
  ],
}

describe("project operations", () => {
  it("newProject trims its name and initializes its date and milestones", () => {
    expect(newProject(input, ctx)).toEqual({
      ...input,
      name: "Launch",
      id: "p-fixed",
      startedOn: ctx.today,
      milestones: [],
    })
  })

  it("patchProject trims the replacement name and retains project identity and milestones", () => {
    const next = patchProject(project, input)
    expect(next).toMatchObject({ id: "p-1", name: "Launch", color: "teal", stage: "building", startedOn: "2027-01-01" })
    expect(next.milestones).toEqual(project.milestones)
  })

  it("toggleMilestone marks a milestone today and clears an already completed one", () => {
    const done = toggleMilestone(project, "m-1", ctx)
    expect(done.milestones[0].doneOn).toBe(ctx.today)
    expect(toggleMilestone(done, "m-1", ctx).milestones[0].doneOn).toBeNull()
    expect(done.milestones[1].doneOn).toBe("2027-01-10")
  })

  it("addMilestone trims the title and sorts by due date", () => {
    const next = addMilestone(project, "  Release  ", "2027-01-20", ctx)
    expect(next.milestones).toEqual([
      { id: "M-fixed", title: "Release", due: "2027-01-20", doneOn: null },
      project.milestones[0],
      project.milestones[1],
    ])
  })

  it("updates milestone title and due date, trims titles, and keeps milestones sorted", () => {
    const next = updateMilestone(project, "m-2", { title: "  Launch  ", due: "2027-01-10" })
    expect(next.milestones).toEqual([
      { ...project.milestones[1], title: "Launch", due: "2027-01-10" },
      project.milestones[0],
    ])
    expect(project.milestones[1]).toMatchObject({ title: "Second", due: "2027-03-01" })
  })

  it("removes only the selected milestone", () => {
    expect(removeMilestone(project, "m-1").milestones).toEqual([project.milestones[1]])
  })
})
