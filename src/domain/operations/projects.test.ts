import { describe, expect, it } from "vitest"
import type { OpContext } from "./context"
import { addMilestone, newProject, patchProject, removeMilestone, restoreMilestone, toggleMilestone, updateMilestone } from "./projects"
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
      dirNames: [],
    })
  })

  it("newProject trims supplied directory names and keeps their order", () => {
    expect(newProject({ ...input, dirNames: [] }, ctx).dirNames).toEqual([])
    const next = newProject({ ...input, dirNames: ["  Blog-V2 ", "shop  "] }, ctx)
    expect(next.dirNames).toEqual(["Blog-V2", "shop"])
  })

  it("patchProject trims the replacement name and retains project identity and milestones", () => {
    const current = { ...project, dirNames: ["existing-repo"] }
    const next = patchProject(current, input)
    expect(next).toMatchObject({ id: "p-1", name: "Launch", color: "teal", stage: "building", startedOn: "2027-01-01" })
    expect(next.dirNames).toEqual(["existing-repo"])
    expect(next.milestones).toEqual(project.milestones)
  })

  it("patchProject clears directory names when given an empty list", () => {
    expect(patchProject({ ...project, dirNames: ["existing-repo"] }, { ...input, dirNames: [] }).dirNames).toEqual([])
  })

  it("patchProject trims supplied directory names", () => {
    const next = patchProject(project, { ...input, dirNames: ["  Blog-V2 ", "shop  "] })
    expect(next.dirNames).toEqual(["Blog-V2", "shop"])
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

  it("keeps the completion date when a finished milestone is edited", () => {
    const next = updateMilestone(project, "m-2", { title: "Renamed" })
    expect(next.milestones[1]).toEqual({ ...project.milestones[1], title: "Renamed" })
  })

  it("removes only the selected milestone", () => {
    expect(removeMilestone(project, "m-1").milestones).toEqual([project.milestones[1]])
  })

  it("restoreMilestone puts a removed milestone back unchanged and in due-date order", () => {
    const removed = project.milestones[0]
    const restored = restoreMilestone(removeMilestone(project, "m-1"), removed)
    expect(restored.milestones).toEqual(project.milestones)
  })

  it("restoreMilestone keeps a restored completed milestone completed", () => {
    const removed = project.milestones[1]
    expect(restoreMilestone(removeMilestone(project, "m-2"), removed).milestones[1]).toEqual(removed)
  })

  it("restoreMilestone leaves the project untouched when the milestone is already there", () => {
    expect(restoreMilestone(project, project.milestones[0])).toBe(project)
  })
})
