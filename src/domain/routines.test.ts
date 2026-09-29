import { beforeAll, describe, expect, it } from "vitest"
import { isDone, isDueOn, routineMinutesOn, streak, toggleDone } from "./routines"
import type { Routine } from "./types"

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai"
})

let n = 0
function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  n += 1
  return {
    id: `r${n}`,
    title: `例行${n}`,
    cadence: "daily",
    estimateMin: 30,
    projectId: null,
    doneOn: [],
    createdOn: "2026-09-01",
    archived: false,
    ...overrides,
  }
}

/** 2026-09-30 是周三；10-03 周六、10-04 周日、10-05 周一 */
const WED = "2026-09-30"
const SAT = "2026-10-03"
const SUN = "2026-10-04"
const MON = "2026-10-05"

describe("isDueOn", () => {
  it("每天例行天天要做", () => {
    const routine = makeRoutine({ cadence: "daily" })
    expect(isDueOn(routine, WED)).toBe(true)
    expect(isDueOn(routine, SAT)).toBe(true)
  })

  it("工作日例行周末不用做", () => {
    const routine = makeRoutine({ cadence: "weekdays" })
    expect(isDueOn(routine, WED)).toBe(true)
    expect(isDueOn(routine, SAT)).toBe(false)
    expect(isDueOn(routine, SUN)).toBe(false)
    expect(isDueOn(routine, MON)).toBe(true)
  })

  it("停用的（archived）不用做", () => {
    const routine = makeRoutine({ archived: true })
    expect(isDueOn(routine, WED)).toBe(false)
  })

  it("创建日之前的日期不算该做", () => {
    const routine = makeRoutine({ createdOn: WED })
    expect(isDueOn(routine, "2026-09-29")).toBe(false)
    expect(isDueOn(routine, WED)).toBe(true)
  })
})

describe("isDone", () => {
  it("每天例行：当天记过才算做过", () => {
    const routine = makeRoutine({ cadence: "daily", doneOn: [WED] })
    expect(isDone(routine, WED)).toBe(true)
    expect(isDone(routine, "2026-09-29")).toBe(false)
  })

  it("每周的例行：本周任意一天做过都算", () => {
    // 09-30 周三所在周是 09-28（周一）～10-04（周日）
    const routine = makeRoutine({ cadence: "weekly", doneOn: ["2026-09-28"] })
    expect(isDone(routine, WED)).toBe(true)
    expect(isDone(routine, "2026-10-04")).toBe(true)
  })

  it("每周例行上一周做过不算本周", () => {
    const routine = makeRoutine({ cadence: "weekly", doneOn: ["2026-09-25"] })
    expect(isDone(routine, WED)).toBe(false)
  })

  it("每月的例行：当月任意一天做过都算", () => {
    const routine = makeRoutine({ cadence: "monthly", doneOn: ["2026-09-05"] })
    expect(isDone(routine, "2026-09-30")).toBe(true)
  })
})

describe("toggleDone", () => {
  it("没做过 → 记在这一天", () => {
    const routine = makeRoutine({ cadence: "daily", doneOn: ["2026-09-29"] })
    const next = toggleDone(routine, WED)
    expect(next.doneOn).toEqual(["2026-09-29", "2026-09-30"])
  })

  it("本期做过 → 再点一次取消本期", () => {
    const routine = makeRoutine({ cadence: "daily", doneOn: ["2026-09-29", WED] })
    const next = toggleDone(routine, WED)
    expect(next.doneOn).toEqual(["2026-09-29"])
  })

  it("每周例行：本周做过时再点一次，整期的记录都清掉", () => {
    const routine = makeRoutine({ cadence: "weekly", doneOn: ["2026-09-28"] })
    const next = toggleDone(routine, WED)
    expect(next.doneOn).toEqual([])
  })
})

describe("streak", () => {
  it("今天还没做不算断，从昨天往回数", () => {
    const routine = makeRoutine({
      cadence: "daily",
      doneOn: ["2026-09-27", "2026-09-28", "2026-09-29"], // 今天 09-30 还没做
    })
    expect(streak(routine, WED)).toBe(3)
  })

  it("今天做了的话从今天往回数", () => {
    const routine = makeRoutine({
      cadence: "daily",
      doneOn: ["2026-09-28", "2026-09-29", WED],
    })
    expect(streak(routine, WED)).toBe(3)
  })

  it("断掉的日子截断连续数", () => {
    const routine = makeRoutine({
      cadence: "daily",
      doneOn: ["2026-09-28", WED], // 09-29 没做
    })
    expect(streak(routine, WED)).toBe(1)
  })

  it("工作日例行跳过周末", () => {
    // 10-05（周一）还没做；上周做的是 09-28 ~ 10-02
    const routine = makeRoutine({
      cadence: "weekdays",
      doneOn: ["2026-09-28", "2026-09-29", WED, "2026-10-01", "2026-10-02"],
    })
    expect(streak(routine, MON)).toBe(5)
  })

  it("工作日例行周末漏做不断", () => {
    const routine = makeRoutine({
      cadence: "weekdays",
      doneOn: ["2026-09-30", "2026-10-01", "2026-10-02"],
    })
    // 周六（10-03）看：上一期是周五 10-02，做了 → 3
    expect(streak(routine, SAT)).toBe(3)
  })

  it("每周例行今天所在周没做不算断，数上一周", () => {
    const routine = makeRoutine({
      cadence: "weekly",
      doneOn: ["2026-09-21", "2026-09-14"], // 本周（09-28 起）还没做
    })
    expect(streak(routine, WED)).toBe(2)
  })

  it("一天都没做过是 0", () => {
    const routine = makeRoutine({ cadence: "daily", doneOn: [] })
    expect(streak(routine, WED)).toBe(0)
  })
})

describe("routineMinutesOn", () => {
  it("每天的例行按当天算", () => {
    const routines = [makeRoutine({ cadence: "daily", estimateMin: 30 })]
    expect(routineMinutesOn(routines, WED)).toBe(30)
    expect(routineMinutesOn(routines, SAT)).toBe(30)
  })

  it("工作日的例行周末不算", () => {
    const routines = [makeRoutine({ cadence: "weekdays", estimateMin: 20 })]
    expect(routineMinutesOn(routines, WED)).toBe(20)
    expect(routineMinutesOn(routines, SAT)).toBe(0)
  })

  it("每周的只在做了的那天算", () => {
    const routines = [makeRoutine({ cadence: "weekly", estimateMin: 60, doneOn: ["2026-09-29"] })]
    expect(routineMinutesOn(routines, "2026-09-29")).toBe(60)
    expect(routineMinutesOn(routines, WED)).toBe(0)
  })

  it("每月的只在做了的那天算", () => {
    const routines = [makeRoutine({ cadence: "monthly", estimateMin: 45, doneOn: [WED] })]
    expect(routineMinutesOn(routines, WED)).toBe(45)
    expect(routineMinutesOn(routines, "2026-09-29")).toBe(0)
  })

  it("停用的不算", () => {
    const routines = [makeRoutine({ archived: true, estimateMin: 30 })]
    expect(routineMinutesOn(routines, WED)).toBe(0)
  })
})
