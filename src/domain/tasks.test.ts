import { beforeAll, describe, expect, it } from "vitest"
import { isOverdue, isSlipped, sortTasks, taskCode } from "./tasks"
import type { Task } from "./types"

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai"
})

/** 今天：2026-09-30（周三） */
const TODAY = "2026-09-30"

let seq = 0
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1
  return {
    id: `t${seq}`,
    seq: 100 + seq,
    title: `任务${seq}`,
    projectId: null,
    status: "todo",
    priority: 2,
    estimateMin: 30,
    plannedFor: null,
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: seq,
    completedAt: null,
    ...overrides,
  }
}

describe("taskCode", () => {
  it("返回 T-<seq>", () => {
    expect(taskCode({ seq: 123 })).toBe("T-123")
    expect(taskCode({ seq: 100 })).toBe("T-100")
  })
})

describe("isOverdue", () => {
  it("截止日当天不算逾期", () => {
    const task = makeTask({ dueOn: TODAY, status: "todo" })
    expect(isOverdue(task, TODAY)).toBe(false)
  })

  it("过了截止日没做完算逾期", () => {
    const task = makeTask({ dueOn: "2026-09-29", status: "todo" })
    expect(isOverdue(task, TODAY)).toBe(true)
  })

  it("已完成的不算逾期", () => {
    const task = makeTask({ dueOn: "2026-09-01", status: "done", completedAt: 1000 })
    expect(isOverdue(task, TODAY)).toBe(false)
  })

  it("已搁置的不算逾期", () => {
    const task = makeTask({ dueOn: "2026-09-01", status: "dropped" })
    expect(isOverdue(task, TODAY)).toBe(false)
  })

  it("没有截止日的谈不上逾期", () => {
    expect(isOverdue(makeTask({ dueOn: null }), TODAY)).toBe(false)
  })
})

describe("isSlipped", () => {
  it("计划在之前某天做、还没做完算滑期", () => {
    const task = makeTask({ plannedFor: "2026-09-28", status: "doing" })
    expect(isSlipped(task, TODAY)).toBe(true)
  })

  it("计划就是今天不算滑期", () => {
    const task = makeTask({ plannedFor: TODAY, status: "todo" })
    expect(isSlipped(task, TODAY)).toBe(false)
  })

  it("已完成的不算滑期", () => {
    const task = makeTask({ plannedFor: "2026-09-01", status: "done", completedAt: 1000 })
    expect(isSlipped(task, TODAY)).toBe(false)
  })

  it("backlog 状态不算滑期（不在待办/进行中）", () => {
    const task = makeTask({ plannedFor: "2026-09-01", status: "backlog" })
    expect(isSlipped(task, TODAY)).toBe(false)
  })
})

describe("sortTasks 按优先级", () => {
  it("紧急（4）排最前", () => {
    const tasks = [
      makeTask({ id: "mid", priority: 2 }),
      makeTask({ id: "urgent", priority: 4 }),
      makeTask({ id: "high", priority: 3 }),
    ]
    const sorted = sortTasks(tasks, "priority")
    expect(sorted.map((task) => task.id)).toEqual(["urgent", "high", "mid"])
  })

  it("无优先级（0）排在最后", () => {
    const tasks = [
      makeTask({ id: "none", priority: 0 }),
      makeTask({ id: "low", priority: 1 }),
      makeTask({ id: "urgent", priority: 4 }),
    ]
    const sorted = sortTasks(tasks, "priority")
    expect(sorted.map((task) => task.id)).toEqual(["urgent", "low", "none"])
  })

  it("优先级相同时按截止日早的在前", () => {
    const tasks = [
      makeTask({ id: "later", priority: 2, dueOn: "2026-10-10" }),
      makeTask({ id: "sooner", priority: 2, dueOn: "2026-10-01" }),
    ]
    expect(sortTasks(tasks, "priority").map((task) => task.id)).toEqual(["sooner", "later"])
  })

  it("不改动传入的数组", () => {
    const tasks = [makeTask({ id: "a", priority: 1 }), makeTask({ id: "b", priority: 4 })]
    sortTasks(tasks, "priority")
    expect(tasks.map((task) => task.id)).toEqual(["a", "b"])
  })
})
