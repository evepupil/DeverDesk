import { beforeAll, describe, expect, it } from "vitest"
import { addDays } from "../../../../src/domain/calendar"
import { doneIn, estimateAccuracy, hourlyRate, minutesByWeekday, minutesIn, projectStats } from "../../../../src/domain/insights"
import { totals } from "../../../../src/domain/ledger"
import { toWallWorkbench } from "../../data/wall"
import { ToolInputError } from "../../types"
import { roundMoney } from "../shared/numbers"
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
      hourlyRate: roundMoney(hourlyRate(currentMoney.net, currentMinutes)),
      tasksDone: doneIn(wallCurrent.tasks, range, project.id).length,
    })
    expect(result.previous).toMatchObject({
      income: previousMoney.income,
      expense: previousMoney.expense,
      net: previousMoney.net,
      minutes: previousMinutes,
      hourlyRate: roundMoney(hourlyRate(previousMoney.net, previousMinutes)),
      tasksDone: doneIn(wallPrevious.tasks, previousRange, project.id).length,
    })
    expect((result.byProject as Array<Record<string, unknown>>)[0]).toMatchObject({
      project: { id: project.id, name: project.name },
      minutes: currentProject.minutes,
      hourlyRate: roundMoney(currentProject.rate),
      tasksDone: currentProject.done,
    })
    expect(result.estimateAccuracy).toEqual(estimateAccuracy(wallCurrent.tasks, wallEstimates, range))
    expect(result.minutesByWeekday).toEqual(minutesByWeekday(wallCurrent.entries, range))
  })

  it("compares the last 7, 30, 90 or 365 days ending today with the same number of days right before", async () => {
    // 假定今天是 2026-10-01
    const ctx = toolContext(makeWorkbench())
    type Period = { start: string; end: string }
    const rangeOf = async (range?: "week" | "month" | "quarter" | "year") =>
      (await getStatsTool.run(ctx, range === undefined ? {} : { range })).range as { current: Period; previous: Period }
    const daysIn = (period: Period) => Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86_400_000) + 1

    expect(await rangeOf("week")).toEqual({
      current: { start: "2026-09-25", end: "2026-10-01" },
      previous: { start: "2026-09-18", end: "2026-09-24" },
    })
    expect(await rangeOf("month")).toEqual({
      current: { start: "2026-09-02", end: "2026-10-01" },
      previous: { start: "2026-08-03", end: "2026-09-01" },
    })
    expect(await rangeOf()).toEqual(await rangeOf("month"))
    for (const [range, days] of [["quarter", 90], ["year", 365]] as const) {
      const { current, previous } = await rangeOf(range)
      expect(current.end).toBe("2026-10-01")
      expect(daysIn(current)).toBe(days)
      expect(daysIn(previous)).toBe(days)
      expect(addDays(previous.end, 1)).toBe(current.start)
    }
  })

  it("counts records by the rolling windows even when they cross calendar months", async () => {
    const ledger = [
      makeLedger({ id: "l-current", amount: 100, date: "2026-09-05" }),
      makeLedger({ id: "l-previous", amount: 40, date: "2026-08-20" }),
      makeLedger({ id: "l-too-old", amount: 7, date: "2026-08-02" }),
    ]
    const result = await getStatsTool.run(toolContext(makeWorkbench({ ledger })), { range: "month" })

    expect(result.current).toMatchObject({ income: 100 })
    expect(result.previous).toMatchObject({ income: 40 })
  })

  it("rounds money sums and hourly rates to cents for both periods and each project", async () => {
    const project = makeProject()
    const ledger = [
      makeLedger({ id: "l-a", projectId: project.id, amount: 88.8, date: "2026-10-01" }),
      makeLedger({ id: "l-b", projectId: project.id, amount: 19.99, date: "2026-10-01" }),
      makeLedger({ id: "l-c", projectId: project.id, kind: "expense", category: "tools", amount: 47.5, date: "2026-10-01" }),
      makeLedger({ id: "l-prev-a", projectId: project.id, amount: 0.1, date: "2026-09-30" }),
      makeLedger({ id: "l-prev-b", projectId: project.id, amount: 0.2, date: "2026-09-30" }),
    ]
    // 111 分钟 = 1.85 小时，净收入 61.29 除下来除不尽
    const entries = [makeEntry({ id: "e-a", projectId: project.id, start: Date.parse("2026-10-01T01:00:00Z"), end: Date.parse("2026-10-01T02:51:00Z") })]
    const ctx = toolContext(makeWorkbench({ projects: [project], ledger, entries }))
    const result = await getStatsTool.run(ctx, { start: "2026-10-01", end: "2026-10-01" })

    expect(result.current).toMatchObject({ income: 108.79, expense: 47.5, net: 61.29, minutes: 111, hourlyRate: 33.13 })
    expect(result.previous).toMatchObject({ income: 0.3, net: 0.3 })
    expect((result.byProject as Array<Record<string, unknown>>)[0]).toMatchObject({ income: 108.79, net: 61.29, hourlyRate: 33.13 })
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
