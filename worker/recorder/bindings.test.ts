import { describe, expect, it } from "vitest"
import type { Project } from "../../src/domain/types"
import { bindingsFromProjects } from "./bindings"

const project = (id: string, name: string, dirNames: string[]): Project => ({
  id,
  name,
  color: "blue",
  stage: "running",
  goal: "",
  startedOn: "2026-01-01",
  monthlyTarget: null,
  milestones: [],
  dirNames,
})

describe("recorder project bindings", () => {
  it("lowercases names and returns a stable sorted mapping", () => {
    expect(bindingsFromProjects([
      { value: project("p-2", "Second", ["Zoo", "Beta"]), updatedAt: 1, rev: 2 },
      { value: project("p-1", "First", ["Alpha"]), updatedAt: 1, rev: 1 },
    ])).toEqual({ bindings: [
      { dir: "alpha", projectId: "p-1", projectName: "First" },
      { dir: "beta", projectId: "p-2", projectName: "Second" },
      { dir: "zoo", projectId: "p-2", projectName: "Second" },
    ] })
  })

  it("returns no bindings for projects without directory names", () => {
    expect(bindingsFromProjects([{ value: project("p-1", "First", []), updatedAt: 1, rev: 1 }]))
      .toEqual({ bindings: [] })
  })
})
