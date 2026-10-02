import { describe, expect, it } from "vitest"
import { createMemoryDataSource } from "../mcp/data/memory"
import { FIXED_NOW, FIXED_TODAY, makeProject, makeTask, makeWorkbench } from "../mcp/tools/read/test-support"
import { getRecorderBriefing } from "./briefing"

describe("getRecorderBriefing", () => {
  it("reports omitted counts and never lists a planned task as overdue", async () => {
    const project = makeProject({ id: "p-briefing", dirNames: ["Repo"] })
    const overlap = makeTask({
      id: "t-overlap", seq: 101, projectId: project.id, plannedFor: FIXED_TODAY, dueOn: "2026-09-30",
    })
    const planned = Array.from({ length: 10 }, (_, index) => makeTask({
      id: `t-planned-${index}`, seq: 102 + index, projectId: project.id, plannedFor: FIXED_TODAY,
    }))
    const overdue = Array.from({ length: 11 }, (_, index) => makeTask({
      id: `t-overdue-${index}`, seq: 112 + index, projectId: project.id, plannedFor: null, dueOn: "2026-09-30",
    }))
    const open = Array.from({ length: 17 }, (_, index) => makeTask({
      id: `t-open-${index}`, seq: 123 + index, projectId: project.id, plannedFor: null,
    }))
    const data = createMemoryDataSource(makeWorkbench({ projects: [project], tasks: [overlap, ...planned, ...overdue, ...open] }))

    const result = await getRecorderBriefing(data, "repo", FIXED_NOW) as Awaited<ReturnType<typeof getRecorderBriefing>> & {
      more?: { plannedToday: number; overdue: number; open: number }
    }
    expect(result?.plannedToday).toHaveLength(10)
    expect(result?.plannedToday[0]?.code).toBe("T-101")
    expect(result?.overdue).toHaveLength(5)
    expect(result?.overdue.some((task) => task.code === "T-101")).toBe(false)
    expect(result?.open).toHaveLength(15)
    expect(result?.more).toEqual({ plannedToday: 1, overdue: 6, open: 2 })
  })

  it("lists unfinished milestones by due date and counts the ones left out", async () => {
    const milestones = [
      { id: "m-done", title: "Already shipped", due: "2026-09-01", doneOn: "2026-09-02" },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `m-${index}`, title: `Release ${index}`, due: `2026-10-${String(20 - index).padStart(2, "0")}`, doneOn: null,
      })),
    ]
    const project = makeProject({ id: "p-milestones", dirNames: ["Repo"], milestones })
    const data = createMemoryDataSource(makeWorkbench({ projects: [project] }))

    const result = await getRecorderBriefing(data, "repo", FIXED_NOW)

    expect(result?.milestones).toHaveLength(8)
    expect(result?.milestones?.[0]).toEqual({ title: "Release 9", due: "2026-10-11" })
    expect(result?.milestones?.[7]).toEqual({ title: "Release 2", due: "2026-10-18" })
    expect(result?.milestones?.some((milestone) => milestone.title === "Already shipped")).toBe(false)
    expect(result?.more?.milestones).toBe(2)
  })

  it("leaves the milestone fields out when nothing is pending or the folder is unbound", async () => {
    const finished = makeProject({
      id: "p-finished", dirNames: ["Repo"],
      milestones: [{ id: "m-done", title: "Shipped", due: "2026-09-01", doneOn: "2026-09-02" }],
    })
    const data = createMemoryDataSource(makeWorkbench({ projects: [finished] }))

    const bound = await getRecorderBriefing(data, "repo", FIXED_NOW)
    expect(bound).not.toHaveProperty("milestones")
    expect(bound?.more).not.toHaveProperty("milestones")

    const unbound = await getRecorderBriefing(data, "somewhere-else", FIXED_NOW)
    expect(unbound).not.toHaveProperty("milestones")
  })
})
