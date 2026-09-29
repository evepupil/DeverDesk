import { beforeAll, describe, expect, it } from "vitest"
import { autoSchedule, capacityFor, dayLoad, findSlot, layoutBlocks } from "./planning"
import type { Block } from "./planning"
import type { Profile, Task } from "./types"

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

/** 2026-09-30 是周三，2026-10-03 是周六 */
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

describe("capacityFor", () => {
  it("工作日取 weekdayMin", () => {
    expect(capacityFor(WED, profile)).toBe(180)
  })

  it("周末取 weekendMin", () => {
    expect(capacityFor(SAT, profile)).toBe(300)
  })
})

describe("dayLoad", () => {
  it("已排时长 = 当天任务预估之和 + 传入的例行分钟数", () => {
    const tasks = [
      makeTask({ estimateMin: 60 }),
      makeTask({ estimateMin: 45, plannedFor: SAT }), // 别的天，不算
    ]
    const load = dayLoad(tasks, WED, profile, 30)
    expect(load.planned).toBe(90)
    expect(load.count).toBe(1)
    expect(load.capacity).toBe(180)
  })

  it("已完成的算进已排、也算进 done", () => {
    const tasks = [
      makeTask({ estimateMin: 60 }),
      makeTask({ estimateMin: 30, status: "done" }),
    ]
    const load = dayLoad(tasks, WED, profile, 0)
    expect(load.planned).toBe(90)
    expect(load.done).toBe(30)
    expect(load.count).toBe(2)
    expect(load.doneCount).toBe(1)
  })

  it("已搁置（dropped）的不算", () => {
    const tasks = [
      makeTask({ estimateMin: 60 }),
      makeTask({ estimateMin: 90, status: "dropped" }),
    ]
    const load = dayLoad(tasks, WED, profile, 0)
    expect(load.planned).toBe(60)
    expect(load.count).toBe(1)
    expect(load.done).toBe(0)
    expect(load.doneCount).toBe(0)
  })
})

describe("layoutBlocks", () => {
  it("两个时间重叠的块分到两列（lanes 为 2）", () => {
    const blocks: Block[] = [
      { taskId: "a", start: 9 * 60, end: 10 * 60 },
      { taskId: "b", start: 9 * 60 + 30, end: 10 * 60 + 30 },
    ]
    const placed = layoutBlocks(blocks)
    expect(placed.map((b) => b.taskId).sort()).toEqual(["a", "b"])
    const a = placed.find((b) => b.taskId === "a")!
    const b = placed.find((b) => b.taskId === "b")!
    expect(a.lanes).toBe(2)
    expect(b.lanes).toBe(2)
    expect([a.lane, b.lane].sort()).toEqual([0, 1])
  })

  it("不重叠的块各自一列（lanes 为 1、lane 为 0）", () => {
    const blocks: Block[] = [
      { taskId: "a", start: 9 * 60, end: 10 * 60 },
      { taskId: "b", start: 10 * 60, end: 11 * 60 },
    ]
    const placed = layoutBlocks(blocks)
    expect(placed.map((b) => ({ id: b.taskId, lane: b.lane, lanes: b.lanes }))).toEqual([
      { id: "a", lane: 0, lanes: 1 },
      { id: "b", lane: 0, lanes: 1 },
    ])
  })
})

describe("findSlot", () => {
  it("从给定分钟开始按 15 分钟对齐找空档", () => {
    // 607 不是 15 的倍数，对齐到 615
    expect(findSlot([], 30, 607, 23 * 60)).toBe(615)
  })

  it("空档正好在已有块之前时放在块前面", () => {
    const blocks: Block[] = [{ taskId: "a", start: 10 * 60, end: 11 * 60 }]
    expect(findSlot(blocks, 60, 8 * 60, 23 * 60)).toBe(8 * 60)
  })

  it("跳过已有的块，放在块后面并对齐", () => {
    const blocks: Block[] = [{ taskId: "a", start: 9 * 60, end: 11 * 60 }]
    expect(findSlot(blocks, 30, 9 * 60, 23 * 60)).toBe(11 * 60)
  })

  it("放不下的返回 null", () => {
    const blocks: Block[] = [{ taskId: "a", start: 9 * 60, end: 10 * 60 }]
    // 块之后只剩 10:00–11:40，放不下 120 分钟
    expect(findSlot(blocks, 120, 8 * 60, 11 * 60 + 40)).toBeNull()
  })
})

describe("autoSchedule", () => {
  it("按给定顺序把没排时间的任务依次放进空档，返回 HH:mm", () => {
    const tasks = [makeTask({ id: "t1", estimateMin: 30 }), makeTask({ id: "t2", estimateMin: 45 })]
    const result = autoSchedule(tasks, [], 9 * 60, 23 * 60)
    expect(result.get("t1")).toBe("09:00")
    expect(result.get("t2")).toBe("09:30")
  })

  it("避开已有的块", () => {
    const tasks = [makeTask({ id: "t1", estimateMin: 30 })]
    const existing: Block[] = [{ taskId: "x", start: 9 * 60, end: 11 * 60 }]
    const result = autoSchedule(tasks, existing, 9 * 60, 23 * 60)
    expect(result.get("t1")).toBe("11:00")
  })

  it("放不下的不排", () => {
    const tasks = [
      makeTask({ id: "t1", estimateMin: 120 }),
      makeTask({ id: "t2", estimateMin: 30 }),
    ]
    // 09:00–10:00 已被占，之后到 11:00 截止只剩 60 分钟，120 分钟放不下；30 分钟能放下
    const existing: Block[] = [{ taskId: "x", start: 9 * 60, end: 10 * 60 }]
    const result = autoSchedule(tasks, existing, 9 * 60, 11 * 60)
    expect(result.has("t1")).toBe(false)
    expect(result.get("t2")).toBe("10:00")
  })
})
