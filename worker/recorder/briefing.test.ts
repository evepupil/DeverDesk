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
})
