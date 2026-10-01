import { beforeAll, describe, expect, it } from "vitest"
import { dayLoad } from "../../../../src/domain/planning"
import { routineMinutesOn } from "../../../../src/domain/routines"
import { sortTasks } from "../../../../src/domain/tasks"
import { toWallWorkbench } from "../../data/wall"
import { getDayTool } from "./get-day"
import { makeEntry, makeLedger, makeProject, makeRoutine, makeTask, makeTimer, makeWorkbench, toolContext } from "./test-support"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

describe("get_day", () => {
  it("matches the domain capacity, tracked time, routines, timer, and monthly money", async () => {
    const today = "2026-10-01"
    const project = makeProject()
    const tasks = [
      makeTask({ id: "t-planned", seq: 101, plannedFor: today, startAt: "09:00", estimateMin: 160, projectId: project.id }),
      makeTask({ id: "t-open", seq: 102, status: "doing", priority: 4, plannedFor: today, estimateMin: 30 }),
    ]
    const routines = [
      makeRoutine({ id: "r-daily", estimateMin: 20, doneOn: [today] }),
      makeRoutine({ id: "r-weekly", cadence: "weekly", estimateMin: 25, doneOn: [today] }),
      makeRoutine({ id: "r-archived", archived: true, estimateMin: 90 }),
    ]
    const entries = [makeEntry({ id: "e-today", taskId: tasks[0].id, projectId: project.id, start: Date.parse("2026-10-01T01:00:00Z"), end: Date.parse("2026-10-01T02:02:00Z") })]
    const ledger = [
      makeLedger({ id: "l-income", amount: 300, projectId: project.id, date: today }),
      makeLedger({ id: "l-expense", kind: "expense", category: "tools", amount: 40, date: today }),
      makeLedger({ id: "l-overdue", status: "pending", expectedOn: "2026-09-30", date: "2026-09-20", amount: 75 }),
    ]
    const data = makeWorkbench({ profile: { ...makeWorkbench().profile, weekdayMin: 120 }, projects: [project], tasks, routines, entries, ledger, timer: makeTimer({ taskId: tasks[0].id, projectId: project.id }) })
    const ctx = toolContext(data)
    const result = await getDayTool.run(ctx, {})
    const wall = toWallWorkbench({ profile: data.profile, projects: data.projects, tasks, entries, routines }, ctx.clock)
    const domainLoad = dayLoad(wall.tasks, today, wall.profile, routineMinutesOn(wall.routines, today))

    const capacity = result.capacity as { capacityMin: number; plannedMin: number; routineMin: number; overbooked: boolean }
    const tracked = result.tracked as { totalMin: number; entries: Array<{ id: string }> }
    const routinesResult = result.routines as Array<{ id: string; done: boolean }>
    expect(result.date).toBe(today)
    expect(capacity).toEqual({
      capacityMin: domainLoad.capacity,
      plannedMin: domainLoad.planned,
      routineMin: routineMinutesOn(wall.routines, today),
      overbooked: domainLoad.planned > domainLoad.capacity,
    })
    expect(tracked.totalMin).toBe(62)
    expect(routinesResult.map((routine) => routine.id)).toEqual(["r-daily", "r-weekly"])
    expect(routinesResult.map((routine) => routine.done)).toEqual([true, true])
    const money = result.money as { income: number; expense: number; net: number; pendingCount: number; overduePending: unknown[] }
    expect(result.timer).toMatchObject({ label: "Test task", runningMin: 5, project: { id: project.id } })
    expect(money).toMatchObject({ income: 300, expense: 40, net: 260, pendingCount: 1 })
    expect(money.overduePending).toHaveLength(1)
  })

  it("rounds the monthly money sums to cents", async () => {
    const today = "2026-10-01"
    const ledger = [
      makeLedger({ id: "l-a", amount: 88.8, date: today }),
      makeLedger({ id: "l-b", amount: 19.99, date: today }),
      makeLedger({ id: "l-c", kind: "expense", category: "tools", amount: 47.5, date: today }),
    ]
    const result = await getDayTool.run(toolContext(makeWorkbench({ ledger })), {})

    expect(result.money).toMatchObject({ income: 108.79, expense: 47.5, net: 61.29 })
  })

  it("caps due, soon, and slipped candidates while preserving sorted visible rows", async () => {
    const overdue = Array.from({ length: 30 }, (_, index) => makeTask({
      id: `t-overdue-${index}`,
      seq: 100 + index,
      priority: index % 5 as 0 | 1 | 2 | 3 | 4,
      dueOn: "2026-09-30",
    }))
    const dueSoon = Array.from({ length: 11 }, (_, index) => makeTask({
      id: `t-soon-${index}`,
      seq: 300 + index,
      dueOn: "2026-10-04",
    }))
    const slipped = Array.from({ length: 30 }, (_, index) => makeTask({
      id: `t-slipped-${index}`,
      seq: 200 + index,
      plannedFor: "2026-09-30",
    }))
    const all = [...overdue, ...dueSoon, ...slipped]
    const result = await getDayTool.run(toolContext(makeWorkbench({ tasks: all })), { date: "2026-10-01" })

    expect((result.overdue as Array<{ id: string }>).map((task) => task.id)).toEqual(
      sortTasks([...overdue, ...slipped], "priority").slice(0, 20).map((task) => task.id),
    )
    expect((result.dueSoon as Array<{ id: string }>).map((task) => task.id)).toEqual(
      sortTasks(dueSoon, "due").slice(0, 10).map((task) => task.id),
    )
    expect(result.truncatedByKind).toEqual({ overdue: true, dueSoon: true, overduePending: false })
    expect(result.truncated).toBe(true)
  })

  it("attributes entries to the Shanghai day containing their start at local midnight", async () => {
    const beforeMidnight = makeEntry({ id: "e-before", start: Date.parse("2026-10-01T15:59:00Z"), end: Date.parse("2026-10-01T16:00:00Z") })
    const afterMidnight = makeEntry({ id: "e-after", start: Date.parse("2026-10-01T16:00:00Z"), end: Date.parse("2026-10-01T16:01:00Z") })
    const ctx = toolContext(makeWorkbench({ entries: [beforeMidnight, afterMidnight] }), Date.parse("2026-10-01T16:05:00Z"))

    const yesterday = await getDayTool.run(ctx, { date: "2026-10-01" })
    const today = await getDayTool.run(ctx, {})

    const yesterdayEntries = (yesterday.tracked as { entries: Array<{ id: string }> }).entries
    const todayEntries = (today.tracked as { entries: Array<{ id: string }> }).entries
    expect(ctx.clock.today).toBe("2026-10-02")
    expect(yesterdayEntries.map((entry) => entry.id)).toEqual(["e-before"])
    expect(today.date).toBe("2026-10-02")
    expect(todayEntries.map((entry) => entry.id)).toEqual(["e-after"])
  })
})
