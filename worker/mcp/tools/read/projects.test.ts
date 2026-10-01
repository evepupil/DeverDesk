import { beforeAll, describe, expect, it } from "vitest"
import { summarizeProject } from "../../../../src/domain/projects"
import { projectStats } from "../../../../src/domain/insights"
import { toWallWorkbench } from "../../data/wall"
import { getProjectTool } from "./get-project"
import { listProjectsTool } from "./list-projects"
import { makeEntry, makeLedger, makeProject, makeTask, makeWorkbench, toolContext } from "./test-support"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

describe("project read tools", () => {
  it("lists active projects and matches the shared monthly project metrics", async () => {
    const project = makeProject({
      milestones: [
        { id: "m-done", title: "First release", due: "2026-09-01", doneOn: "2026-09-01" },
        { id: "m-next", title: "Second release", due: "2026-10-20", doneOn: null },
      ],
    })
    const ended = makeProject({ id: "p-ended", name: "Ended", stage: "ended" })
    const task = makeTask({ id: "t-project", seq: 101, projectId: project.id, plannedFor: "2026-10-01", status: "todo" })
    const entries = [
      makeEntry({ id: "e-project", projectId: project.id, taskId: task.id, start: Date.parse("2026-10-01T01:00:00Z"), end: Date.parse("2026-10-01T03:00:00Z") }),
      makeEntry({ id: "e-old", projectId: project.id, start: Date.parse("2026-09-10T01:00:00Z"), end: Date.parse("2026-09-10T02:00:00Z") }),
    ]
    const ledger = [
      makeLedger({ id: "l-in", projectId: project.id, amount: 500, date: "2026-10-01" }),
      makeLedger({ id: "l-out", projectId: project.id, kind: "expense", category: "tools", amount: 100, date: "2026-10-02" }),
    ]
    const data = makeWorkbench({ projects: [project, ended], tasks: [task], entries, ledger })
    const ctx = toolContext(data)
    const result = await listProjectsTool.run(ctx, {})
    const listed = result.projects as Array<Record<string, unknown>>
    const wall = toWallWorkbench({ projects: data.projects, tasks: data.tasks, ledger: data.ledger, entries: data.entries }, ctx.clock)
    const expected = projectStats(wall, { start: "2026-10-01", end: "2026-10-31" }).find((stat) => stat.projectId === project.id)!

    expect(result.month).toBe("2026-10-01")
    expect(listed.map((item) => item.id)).toEqual([project.id])
    expect(listed[0]).toMatchObject({
      income: expected.income,
      expense: expected.expense,
      net: expected.net,
      minutes: expected.minutes,
      hourlyRate: expected.rate,
      openTasks: 1,
      nextMilestone: { id: "m-next" },
    })
    const endedResult = await listProjectsTool.run(ctx, { includeEnded: true })
    expect(endedResult.projects).toHaveLength(2)
  })

  it("matches the shared project card summary and marks capped lists", async () => {
    const project = makeProject({ monthlyTarget: 500 })
    const doneTasks = Array.from({ length: 12 }, (_, index) => makeTask({
      id: `t-done-${index}`,
      seq: 101 + index,
      projectId: project.id,
      status: "done",
      plannedFor: null,
      completedAt: Date.parse(`2026-09-${String(20 - index).padStart(2, "0")}T04:00:00Z`),
    }))
    const openTasks = Array.from({ length: 31 }, (_, index) => makeTask({
      id: `t-open-${index}`,
      seq: 200 + index,
      projectId: project.id,
      status: "todo",
      plannedFor: null,
    }))
    const entries = [
      makeEntry({ id: "e-project", projectId: project.id, start: Date.parse("2026-10-01T01:00:00Z"), end: Date.parse("2026-10-01T03:00:00Z") }),
      makeEntry({ id: "e-shanghai-midnight", projectId: project.id, start: Date.parse("2026-10-04T16:30:00Z"), end: Date.parse("2026-10-04T18:30:00Z") }),
    ]
    const ledger = [makeLedger({ id: "l-project", projectId: project.id, amount: 700, date: "2026-10-01" })]
    const data = makeWorkbench({ projects: [project], tasks: [...doneTasks, ...openTasks], entries, ledger })
    const ctx = toolContext(data)
    const result = await getProjectTool.run(ctx, { project: project.id })
    const wall = toWallWorkbench({ projects: data.projects, tasks: data.tasks, entries: data.entries, ledger: data.ledger }, ctx.clock)
    const expected = summarizeProject(wall, wall.projects[0], ctx.clock.today)

    const monthlyTargetProgressPercent = Math.round(Math.max(0, expected.month.net) / (project.monthlyTarget ?? 1) * 100)
    expect(result.month).toEqual({
      income: expected.month.income,
      expense: expected.month.expense,
      net: expected.month.net,
      minutes: expected.month.minutes,
      hourlyRate: expected.month.rate,
    })
    expect(result.monthlyTargetProgressPercent).toBe(monthlyTargetProgressPercent)
    expect(result.totalNet).toBe(expected.totalNet)
    expect(result.totalMinutes).toBe(expected.totalMinutes)
    expect(result.weeks).toEqual(expected.weeks)
    expect(result.openTasks).toBe(31)
    expect((result.openTaskItems as unknown[])).toHaveLength(30)
    expect(result.openTasksTruncated).toBe(true)
    expect(result.recentLedger).toHaveLength(1)
    expect(result.recentCompleted).toHaveLength(10)
    expect(result.recentCompletedTruncated).toBe(true)
    expect(result.truncated).toBe(true)
  })
})
