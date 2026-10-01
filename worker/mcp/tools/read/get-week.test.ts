import { beforeAll, describe, expect, it } from "vitest"
import { addDays, weekStart } from "../../../../src/domain/calendar"
import { dayLoad } from "../../../../src/domain/planning"
import { routineMinutesOn } from "../../../../src/domain/routines"
import { minutesOf } from "../../../../src/domain/tasks"
import { toWallWorkbench } from "../../data/wall"
import { getWeekTool } from "./get-week"
import { makeEntry, makeRoutine, makeTask, makeWorkbench, toolContext } from "./test-support"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

describe("get_week", () => {
  it("returns seven UI-aligned workload and tracked-time totals and truncates unscheduled work", async () => {
    const selected = "2026-10-01"
    const start = weekStart(selected)
    const plannedTasks = [
      makeTask({ id: "t-monday", seq: 101, plannedFor: start, startAt: "09:00", estimateMin: 55 }),
      makeTask({ id: "t-tuesday", seq: 102, plannedFor: addDays(start, 1), startAt: null, estimateMin: 35, status: "doing" }),
    ]
    const unplanned = Array.from({ length: 17 }, (_, index) => makeTask({
      id: `t-open-${index}`,
      seq: 200 + index,
      title: `Open ${index}`,
      plannedFor: null,
      dueOn: addDays(start, index % 5),
      priority: index % 5 as 0 | 1 | 2 | 3 | 4,
    }))
    const routines = [makeRoutine({ id: "r-daily", estimateMin: 15 })]
    const entries = [makeEntry({ id: "e-monday", start: Date.parse("2026-09-28T02:00:00Z"), end: Date.parse("2026-09-28T02:47:00Z") })]
    const data = makeWorkbench({ profile: { ...makeWorkbench().profile, weekdayMin: 120 }, tasks: [...plannedTasks, ...unplanned], routines, entries })
    const ctx = toolContext(data)
    const result = await getWeekTool.run(ctx, { date: selected })
    const days = result.days as Array<{ date: string; capacityMin: number; plannedMin: number; trackedMin: number }>
    const wall = toWallWorkbench({ profile: data.profile, tasks: data.tasks, routines: data.routines, entries: data.entries }, ctx.clock)

    expect(result.weekStart).toBe(start)
    expect(result.weekEnd).toBe(addDays(start, 6))
    expect(days).toHaveLength(7)
    for (const day of days) {
      const load = dayLoad(wall.tasks, day.date, wall.profile, routineMinutesOn(wall.routines, day.date))
      const tracked = wall.entries.filter((entry) => new Date(entry.start).toISOString().slice(0, 10) === day.date)
        .reduce((sum, entry) => sum + minutesOf(entry), 0)
      expect(day).toMatchObject({ capacityMin: load.capacity, plannedMin: load.planned, trackedMin: tracked })
    }
    const unscheduled = result.unscheduled as { count: number; tasks: unknown[]; truncated: boolean }
    expect(unscheduled.count).toBe(17)
    expect(unscheduled.tasks).toHaveLength(15)
    expect(unscheduled.truncated).toBe(true)
    expect(result.truncated).toBe(true)
  })
})
