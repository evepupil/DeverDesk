import { beforeAll, describe, expect, it } from "vitest"
import { addDays, weekStart } from "../../../../src/domain/calendar"
import { weekReview } from "../../../../src/domain/review"
import { toWallWorkbench } from "../../data/wall"
import { getWeekReviewTool } from "./get-week-review"
import { makeEntry, makeLedger, makeNote, makeRoutine, makeTask, makeWorkbench, toolContext } from "./test-support"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

describe("get_week_review", () => {
  it("matches the review domain output, including previous-week tracked time and saved notes", async () => {
    const start = weekStart("2026-10-01")
    const doneTasks = Array.from({ length: 14 }, (_, index) => makeTask({
      id: `t-done-${index}`,
      seq: 101 + index,
      title: `Completed ${index}`,
      status: "done",
      plannedFor: addDays(start, index % 4),
      estimateMin: 30 + index,
      completedAt: Date.parse(`${addDays(start, index % 4)}T04:00:00Z`),
    }))
    const previousTask = makeTask({ id: "t-last-week", seq: 200, status: "done", plannedFor: "2026-09-24", completedAt: Date.parse("2026-09-24T04:00:00Z") })
    const entries = [
      ...doneTasks.slice(0, 5).map((task, index) => makeEntry({ id: `e-current-${index}`, taskId: task.id, start: Date.parse(`${addDays(start, index % 4)}T01:00:00Z`), end: Date.parse(`${addDays(start, index % 4)}T01:30:00Z`) })),
      makeEntry({ id: "e-previous", taskId: previousTask.id, start: Date.parse("2026-09-24T01:00:00Z"), end: Date.parse("2026-09-24T02:00:00Z") }),
      makeEntry({ id: "e-old-hidden-done", taskId: doneTasks[12].id, start: Date.parse("2026-09-01T01:00:00Z"), end: Date.parse("2026-09-01T01:45:00Z") }),
    ]
    const ledger = [
      makeLedger({ id: "l-current", amount: 250, date: "2026-09-29" }),
      makeLedger({ id: "l-previous", amount: 100, date: "2026-09-23" }),
    ]
    const routine = makeRoutine({ id: "r-daily", doneOn: ["2026-09-28", "2026-09-29", "2026-10-01"] })
    const note = makeNote({ wins: "Shipped", improve: "Focus", next: "Review" })
    const data = makeWorkbench({ tasks: [...doneTasks, previousTask], entries, ledger, routines: [routine], notes: [note] })
    const ctx = toolContext(data)
    const result = await getWeekReviewTool.run(ctx, {})
    const currentDoneIds = new Set(doneTasks.map((task) => task.id))
    const estimateEntries = entries.filter((entry) => entry.taskId !== null && currentDoneIds.has(entry.taskId))
    const wall = toWallWorkbench({
      profile: data.profile,
      tasks: data.tasks,
      entries,
      ledger,
      routines: data.routines,
    }, ctx.clock)
    const expected = weekReview(wall, start, ctx.clock.today)

    expect(result.weekStart).toBe(start)
    expect(result.doneCount).toBe(14)
    expect(result.doneTasks).toHaveLength(12)
    expect((result.doneTasks as Array<{ id: string; loggedMin: number }>).every((task) => typeof task.loggedMin === "number")).toBe(true)
    expect((result.doneTasks as Array<{ id: string }>).some((task) => task.id === doneTasks[12].id)).toBe(false)
    expect(result.doneTasksTruncated).toBe(true)
    expect(result.truncated).toBe(true)
    expect(result.minutes).toBe(expected.minutes)
    expect(result.minutesByProject).toEqual([...expected.minutesByProject.entries()].map(([id, minutes]) => ({ project: id === null ? null : expect.objectContaining({ id }), minutes })))
    expect(result.days).toEqual(expected.days)
    expect(result.income).toBe(expected.income)
    expect(result.expense).toBe(expected.expense)
    expect(result.net).toBe(expected.net)
    expect(result.estimateAccuracy).toEqual(expected.accuracy)
    expect(result.routines).toEqual(expected.routines)
    expect(result.previous).toEqual(expected.previous)
    expect((result.previous as { minutes: number }).minutes).toBeGreaterThan(0)
    expect(result.partial).toBe(true)
    expect(result.notes).toEqual({ wins: "Shipped", improve: "Focus", next: "Review" })
    expect(estimateEntries).toHaveLength(6)
  })

  it("shows each completed task's real local completion time instead of shifting it a second time", async () => {
    // 2026-10-01 01:27 UTC 是东八区的 09:27；多平移一次会显示成 17:27
    const task = makeTask({ id: "t-done", seq: 301, status: "done", plannedFor: "2026-10-01", completedAt: Date.parse("2026-10-01T01:27:00Z") })
    const result = await getWeekReviewTool.run(toolContext(makeWorkbench({ tasks: [task] })), {})

    expect((result.doneTasks as Array<{ code: string; completedAt: string }>)).toEqual([
      expect.objectContaining({ code: "T-301", completedAt: "2026-10-01 09:27" }),
    ])
  })
})
