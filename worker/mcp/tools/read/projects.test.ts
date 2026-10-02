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
      dirNames: ["Repo"],
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
    expect(listed[0].directories).toEqual(["Repo"])
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
    expect(await getProjectTool.run(ctx, { project: project.id })).toMatchObject({
      project: { directories: ["Repo"] },
    })
  })

  it("rounds monthly money and hourly rates to cents in the list and the project card", async () => {
    const project = makeProject()
    const ledger = [
      makeLedger({ id: "l-a", projectId: project.id, amount: 88.8, date: "2026-10-01" }),
      makeLedger({ id: "l-b", projectId: project.id, amount: 19.99, date: "2026-10-01" }),
      makeLedger({ id: "l-c", projectId: project.id, kind: "expense", category: "tools", amount: 47.5, date: "2026-10-01" }),
    ]
    // 111 分钟 = 1.85 小时，净收入 61.29 除下来除不尽
    const entries = [makeEntry({ id: "e-a", projectId: project.id, start: Date.parse("2026-10-01T01:00:00Z"), end: Date.parse("2026-10-01T02:51:00Z") })]
    const ctx = toolContext(makeWorkbench({ projects: [project], ledger, entries }))

    const listed = (await listProjectsTool.run(ctx, {})).projects as Array<Record<string, unknown>>
    expect(listed[0]).toMatchObject({ income: 108.79, expense: 47.5, net: 61.29, hourlyRate: 33.13 })

    const card = await getProjectTool.run(ctx, { project: project.id })
    expect(card.month).toEqual({ income: 108.79, expense: 47.5, net: 61.29, minutes: 111, hourlyRate: 33.13 })
    expect(card.totalNet).toBe(61.29)
    expect((card.weeks as Array<{ net: number }>).at(-1)?.net).toBe(61.29)
  })

  it("lists every milestone with the unfinished ones first so a release can tick the right one", async () => {
    const project = makeProject({
      milestones: [
        { id: "m-beta", title: "Beta", due: "2026-09-01", doneOn: "2026-09-02" },
        { id: "m-launch", title: "Launch", due: "2026-11-01", doneOn: null },
        { id: "m-v2", title: "v0.2 release", due: "2026-10-15", doneOn: null },
      ],
    })
    const card = await getProjectTool.run(toolContext(makeWorkbench({ projects: [project] })), { project: project.id })

    expect(card.milestones).toEqual({
      done: 1,
      total: 3,
      next: { id: "m-v2", title: "v0.2 release", due: "2026-10-15", doneOn: null },
      items: [
        { id: "m-v2", title: "v0.2 release", due: "2026-10-15", doneOn: null },
        { id: "m-launch", title: "Launch", due: "2026-11-01", doneOn: null },
        { id: "m-beta", title: "Beta", due: "2026-09-01", doneOn: "2026-09-02" },
      ],
      itemsTruncated: false,
    })
  })

  it("caps a very long milestone list and says so", async () => {
    const milestones = Array.from({ length: 51 }, (_, index) => ({
      id: `m-${index}`, title: `Milestone ${index}`, due: `2027-01-${String((index % 28) + 1).padStart(2, "0")}`, doneOn: null,
    }))
    const project = makeProject({ milestones })
    const card = await getProjectTool.run(toolContext(makeWorkbench({ projects: [project] })), { project: project.id })

    const shown = card.milestones as { total: number; items: unknown[]; itemsTruncated: boolean }
    expect(shown.total).toBe(51)
    expect(shown.items).toHaveLength(50)
    expect(shown.itemsTruncated).toBe(true)
    expect(card.truncated).toBe(true)
  })

  it("presents out-of-range timestamps as empty strings", async () => {
    const project = makeProject({ id: "p-date-range" })
    const completed = makeTask({
      id: "t-date-range", projectId: project.id, status: "done", plannedFor: null,
      completedAt: Number.MAX_VALUE,
    })
    const entry = makeEntry({
      id: "e-date-range", projectId: project.id,
      start: Number.MAX_VALUE, end: Number.MAX_VALUE,
    })
    const result = await getProjectTool.run(toolContext(makeWorkbench({ projects: [project], tasks: [completed], entries: [entry] })), {
      project: project.id,
    })
    expect(result.lastActive).toBe("")
    expect((result.recentCompleted as Array<Record<string, unknown>>)[0]?.completedAt).toBe("")
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
