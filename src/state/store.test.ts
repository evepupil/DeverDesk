import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("./storage", () => ({
  createStorage: () => ({ kind: "local", load: () => null, save: () => true }),
}))

import type { Project } from "@/domain/types"
import { useWorkbench } from "./store"

const originalProjects = useWorkbench.getState().projects

function project(id: string, name: string, dirNames: string[]): Project {
  return {
    id,
    name,
    color: "blue",
    stage: "running",
    goal: "",
    startedOn: "2026-10-02",
    monthlyTarget: null,
    milestones: [],
    dirNames,
  }
}

afterEach(() => useWorkbench.setState({ projects: originalProjects }))

describe("saveProject directory-name validation", () => {
  it("preserves an unchanged conflicting binding when another field changes", () => {
    const first = project("p1", "First", ["shared-dir"])
    const second = project("p2", "Second", ["shared-dir"])
    useWorkbench.setState({ projects: [first, second] })

    const result = useWorkbench.getState().saveProject({
      name: first.name,
      color: first.color,
      stage: "paused",
      goal: first.goal,
      monthlyTarget: first.monthlyTarget,
    }, first.id)

    expect(result.ok).toBe(true)
    expect(useWorkbench.getState().projects[0]).toMatchObject({ stage: "paused", dirNames: ["shared-dir"] })
  })

  it("still rejects a directory-name change that conflicts with another project", () => {
    const first = project("p1", "First", ["first-dir"])
    const second = project("p2", "Second", ["shared-dir"])
    useWorkbench.setState({ projects: [first, second] })

    const result = useWorkbench.getState().saveProject({
      name: first.name,
      color: first.color,
      stage: first.stage,
      goal: first.goal,
      monthlyTarget: first.monthlyTarget,
      dirNames: ["shared-dir"],
    }, first.id)

    expect(result).toEqual({
      ok: false,
      error: { kind: "taken", name: "shared-dir", projectId: "p2", projectName: "Second" },
    })
  })
})
