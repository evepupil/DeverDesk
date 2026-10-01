import { beforeAll, describe, expect, it } from "vitest"
import { dayLoad } from "./planning"
import { weekReview } from "./review"
import { routineMinutesOn } from "./routines"
import type { Profile, Routine, Task, WorkbenchData } from "./types"

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai"
})

const profile: Profile = {
  name: "阿禾",
  weekdayMin: 180,
  weekendMin: 300,
  dayStartHour: 8,
  dayEndHour: 23,
}

/** 2026-09-28 是周一，周六是 10-03 */
const MON = "2026-09-28"
const WED = "2026-09-30"
const SAT = "2026-10-03"

let seq = 0
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1
  return {
    id: `t${seq}`,
    seq,
    title: `任务${seq}`,
    projectId: null,
    status: "todo",
    priority: 2,
    estimateMin: 30,
    plannedFor: WED,
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: seq,
    completedAt: null,
    ...overrides,
  }
}

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  seq += 1
  return {
    id: `r${seq}`,
    title: `例行${seq}`,
    cadence: "daily",
    estimateMin: 20,
    projectId: null,
    doneOn: [],
    createdOn: "2026-09-01",
    archived: false,
    ...overrides,
  }
}

function workbench(overrides: Partial<WorkbenchData> = {}): WorkbenchData {
  return { profile, projects: [], tasks: [], entries: [], ledger: [], routines: [], notes: [], timer: null, ...overrides }
}

function plannedOf(data: WorkbenchData, day: string): number {
  return weekReview(data, MON).days.find((item) => item.day === day)!.planned
}

describe("weekReview 每天的计划时长", () => {
  it("任务预估之外，再加上当天要做的例行事项", () => {
    const data = workbench({
      tasks: [makeTask({ estimateMin: 60 }), makeTask({ estimateMin: 45, plannedFor: SAT })],
      routines: [makeRoutine({ cadence: "daily", estimateMin: 20 })],
    })
    expect(plannedOf(data, WED)).toBe(60 + 20)
    expect(plannedOf(data, SAT)).toBe(45 + 20)
  })

  it("工作日例行周末不算，停用的例行不算", () => {
    const data = workbench({
      routines: [
        makeRoutine({ cadence: "weekdays", estimateMin: 15 }),
        makeRoutine({ cadence: "daily", estimateMin: 99, archived: true }),
      ],
    })
    expect(plannedOf(data, WED)).toBe(15)
    expect(plannedOf(data, SAT)).toBe(0)
  })

  it("每周的例行只在做了的那天算", () => {
    const data = workbench({ routines: [makeRoutine({ cadence: "weekly", estimateMin: 40, doneOn: [WED] })] })
    expect(plannedOf(data, WED)).toBe(40)
    expect(plannedOf(data, MON)).toBe(0)
  })

  it("和今天页、本周页用的容量算法给出同样的数字", () => {
    const data = workbench({
      tasks: [makeTask({ estimateMin: 25 }), makeTask({ estimateMin: 10, status: "done" })],
      routines: [makeRoutine({ cadence: "daily", estimateMin: 30 })],
    })
    for (const item of weekReview(data, MON).days) {
      const load = dayLoad(data.tasks, item.day, data.profile, routineMinutesOn(data.routines, item.day))
      expect(item.planned).toBe(load.planned)
      expect(item.capacity).toBe(load.capacity)
    }
  })
})
