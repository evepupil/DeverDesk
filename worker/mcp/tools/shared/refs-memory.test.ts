import { describe, expect, it } from "vitest"
import type { Task, WorkbenchData } from "../../../../src/domain/types"
import { createMemoryDataSource } from "../../data/memory"
import { ToolInputError } from "../../types"
import { resolveTasks } from "./refs"

function task(id: string, seq: number): Task {
  return {
    id,
    seq,
    title: `任务 ${seq}`,
    projectId: null,
    status: "todo",
    priority: 0,
    estimateMin: 30,
    plannedFor: null,
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: 0,
    completedAt: null,
  }
}

const data: WorkbenchData = {
  profile: { name: "我", weekdayMin: 120, weekendMin: 240, dayStartHour: 8, dayEndHour: 22 },
  projects: [],
  tasks: [task("t-a", 101), task("t-b", 102)],
  entries: [],
  ledger: [],
  routines: [],
  notes: [],
  timer: null,
}

// 用真实的内存数据源（不是替身）：查询条件「并且」、空数组「一个都不要」的语义要真的生效
describe("resolveTasks 搭配真实数据源", () => {
  it("只给显示编号", async () => {
    const found = await resolveTasks(createMemoryDataSource(data), ["T-102"])
    expect(found.get("T-102")?.value.id).toBe("t-b")
  })

  it("只给内部编号", async () => {
    const found = await resolveTasks(createMemoryDataSource(data), ["t-a"])
    expect(found.get("t-a")?.value.seq).toBe(101)
  })

  it("两种混着给", async () => {
    const found = await resolveTasks(createMemoryDataSource(data), ["t-a", "t-102"])
    expect([...found.keys()]).toEqual(["t-a", "t-102"])
    expect(found.get("t-102")?.value.id).toBe("t-b")
  })

  it("找不到的写明是哪个", async () => {
    await expect(resolveTasks(createMemoryDataSource(data), ["T-999", "t-a"])).rejects.toThrow(ToolInputError)
    await expect(resolveTasks(createMemoryDataSource(data), ["T-999"])).rejects.toThrow(/T-999/)
  })
})
