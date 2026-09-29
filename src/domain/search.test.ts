import { beforeAll, describe, expect, it } from "vitest"
import { searchTasks } from "./search"
import type { Task } from "./types"

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai"
})

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

describe("searchTasks 按编号", () => {
  it("输入 t-123 时编号为 T-123 的任务排第一", () => {
    const tasks = [makeTask({ seq: 123, title: "别的内容" }), makeTask({ seq: 124, title: "其他" })]
    const result = searchTasks(tasks, "t-123")
    expect(result[0]?.seq).toBe(123)
  })

  it("输入 123 时编号为 T-123 的任务也排第一", () => {
    const tasks = [makeTask({ seq: 123, title: "别的内容" }), makeTask({ seq: 124, title: "其他" })]
    const result = searchTasks(tasks, "123")
    expect(result[0]?.seq).toBe(123)
  })
})

describe("searchTasks 按标题", () => {
  it("标题开头匹配的排在标题包含的前面", () => {
    const tasks = [
      makeTask({ id: "middle", title: "X写周报" }),
      makeTask({ id: "prefix", title: "写周报的流程" }),
    ]
    const result = searchTasks(tasks, "写周报")
    expect(result.map((task) => task.id)).toEqual(["prefix", "middle"])
  })

  it("备注里命中的也返回，排在标题命中之后", () => {
    const tasks = [
      makeTask({ id: "notes", title: "别的", notes: "提到了写周报" }),
      makeTask({ id: "contains", title: "X写周报" }),
    ]
    const result = searchTasks(tasks, "写周报")
    expect(result.map((task) => task.id)).toEqual(["contains", "notes"])
  })

  it("不匹配的不会混进结果", () => {
    const tasks = [makeTask({ title: "完全无关" })]
    expect(searchTasks(tasks, "写周报")).toEqual([])
  })
})

describe("searchTasks 完成状态", () => {
  it("没做完的排在做完的前面（同为开头匹配时）", () => {
    const tasks = [
      makeTask({ id: "done", title: "写周报", status: "done", completedAt: 1000 }),
      makeTask({ id: "open", title: "写周报二", status: "todo" }),
    ]
    const result = searchTasks(tasks, "写周报")
    expect(result.map((task) => task.id)).toEqual(["open", "done"])
  })

  it("编号完全相同时优先级最高，压过完成状态", () => {
    // 两台设备离线各建一件时显示编号可能相同：同 seq 的任务，没做完的在前
    const tasks = [
      makeTask({ id: "done", seq: 123, title: "别的2", status: "done", completedAt: 1000 }),
      makeTask({ id: "open", seq: 123, title: "别的", status: "todo" }),
    ]
    const result = searchTasks(tasks, "123")
    expect(result.map((task) => task.id)).toEqual(["open", "done"])
  })
})

describe("searchTasks 其他", () => {
  it("空查询返回空", () => {
    expect(searchTasks([makeTask()], "  ")).toEqual([])
  })

  it("限制返回条数", () => {
    const tasks = [makeTask({ title: "写周报1" }), makeTask({ title: "写周报2" }), makeTask({ title: "写周报3" })]
    expect(searchTasks(tasks, "写周报", 2)).toHaveLength(2)
  })
})
