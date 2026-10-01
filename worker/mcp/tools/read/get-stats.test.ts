import { beforeAll, describe, expect, it } from "vitest"
import { doneIn, estimateAccuracy, hourlyRate, minutesByWeekday, minutesIn, projectStats } from "../../../../src/domain/insights"
import { totals } from "../../../../src/domain/ledger"
import { toWallWorkbench } from "../../data/wall"
import { ToolInputError } from "../../types"
import { getStatsTool } from "./get-stats"
import { makeEntry, makeLedger, makeProject, makeTask, makeWorkbench, toolContext } from "./test-support"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

describe("get_stats", () => {
  it("matches shared calculations for two custom periods and a project filter", async () => {
    const project = makeProject()
    const done = [
      makeTask({ id: "t-current", seq: 101, projectId: project.id, status: "done", plannedFor: null, estimateMin: 60, completedAt: Date.parse("2026-10-01T04:00:00Z") }),
      makeTask({ id: "t-previous", seq: 102, projectId: project.id, status: "done", plannedFor: null, estimateMin: 30, completedAt: Date.parse("2026-09-25T04:00:00Z") }),
    ]
    const entries = [
      makeEntry({ id: "e-current", taskId: "t-current", projectId: project.id, start: Date.parse("2026-10-01T01:00:00Z"), end: Date.parse("2026-10-01T02:30:00Z") }),
      makeEntry({ id: "e-previous", taskId: "t-previous", projectId: project.id, start: Date.parse("2026-09-25T01:00:00Z"), end: Date.parse("2026-09-25T01:45:00Z") }),
      makeEntry({ id: "e-history-current-task", taskId: "t-current", projectId: project.id, start: Date.parse("2026-09-15T01:00:00Z"), end: Date.parse("2026-09-15T01:45:00Z") }),
    ]
    const ledger = [
      makeLedger({ id: "l-current", projectId: project.id, amount: 400, date: "2026-10-01" }),
      makeLedger({ id: "l-prev", projectId: project.id, amount: 200, date: "2026-09-25" }),
      makeLedger({ id: "l-expense", projectId: project.id, kind: "expense", category: "tools", amount: 80, date: "2026-09-30" }),
    ]
    const data = makeWorkbench({ projects: [project], tasks: done, entries, ledger })
    const ctx = toolContext(data)
    const range = { start: "2026-09-28", end: "2026-10-01" }
    const previousRange = { start: "2026-09-24", end: "2026-09-27" }
    const result = await getStatsTool.run(ctx, { ...range, project: project.id })
    const currentTasks = [done[0]]
    const previousTasks = [done[1]]
    const currentEntries = [entries[0]]
    const previousEntries = [entries[1]]
    const currentLedger = [ledger[0], ledger[2]]
    const previousLedger = [ledger[1]]
    const wallCurrent = toWallWorkbench({ projects: [project], tasks: currentTasks, entries: currentEntries, ledger: currentLedger }, ctx.clock)
    const wallPrevious = toWallWorkbench({ projects: [project], tasks: previousTasks, entries: previousEntries, ledger: previousLedger }, ctx.clock)
    const wallEstimates = toWallWorkbench({ entries: entries.filter((entry) => entry.taskId === "t-current") }, ctx.clock).entries
    const currentMinutes = minutesIn(wallCurrent.entries, range, project.id)
    const previousMinutes = minutesIn(wallPrevious.entries, previousRange, project.id)
    const currentProject = projectStats(wallCurrent, range)[0]
    const currentMoney = totals(wallCurrent.ledger, range.start, range.end, project.id)
    const previousMoney = totals(wallPrevious.ledger, previousRange.start, previousRange.end, project.id)

    expect(result.range).toEqual({ current: range, previous: previousRange })
    expect(result.current).toEqual({
      ...currentMoney,
      minutes: currentMinutes,
      hourlyRate: hourlyRate(currentMoney.net, currentMinutes),
      tasksDone: doneIn(wallCurrent.tasks, range, project.id).length,
    })
    expect(result.previous).toMatchObject({
      income: previousMoney.income,
      expense: previousMoney.expense,
      net: previousMoney.net,
      minutes: previousMinutes,
      hourlyRate: hourlyRate(previousMoney.net, previousMinutes),
      tasksDone: doneIn(wallPrevious.tasks, previousRange, project.id).length,
    })
    expect((result.byProject as Array<Record<string, unknown>>)[0]).toMatchObject({
      project: { id: project.id, name: project.name },
      minutes: currentProject.minutes,
      hourlyRate: currentProject.rate,
      tasksDone: currentProject.done,
    })
    expect(result.estimateAccuracy).toEqual(estimateAccuracy(wallCurrent.tasks, wallEstimates, range))
    expect(result.minutesByWeekday).toEqual(minutesByWeekday(wallCurrent.entries, range))
  })

  it("rejects ranges over 366 inclusive days and conflicting range forms", async () => {
    const ctx = toolContext(makeWorkbench())
    await expect(getStatsTool.run(ctx, { start: "2025-10-01", end: "2026-10-02" })).rejects.toBeInstanceOf(ToolInputError)
    await expect(getStatsTool.run(ctx, { start: "2025-10-01", end: "2026-10-01" })).resolves.toMatchObject({ range: { current: { start: "2025-10-01", end: "2026-10-01" } } })
    await expect(getStatsTool.run(ctx, { range: "month", start: "2026-10-01", end: "2026-10-02" })).rejects.toBeInstanceOf(ToolInputError)
    const projectCtx = toolContext(makeWorkbench({ projects: [makeProject()] }))
    await expect(getStatsTool.run(projectCtx, { project: "missing" })).rejects.toBeInstanceOf(ToolInputError)
  })
})
