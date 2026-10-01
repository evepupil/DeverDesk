import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import type { Profile } from "../../../../src/domain/types"
import type { PlannedChange, RecordVersion, SingletonVersion, Versioned } from "../../types"
import { createChange, deleteChange, singletonChange, structurallyEqual, updateChange } from "./changes"

beforeAll(() => {
  process.env.TZ = "UTC"
})

const NEW_TASK = { id: "t-1", seq: 0, title: "New task" }

describe("createChange", () => {
  it("库里从没有过（record() 返回 null）：before 系列全为 null", () => {
    const change = createChange("task", "t-1", NEW_TASK, null)
    expect(change).toEqual({
      kind: "task",
      id: "t-1",
      action: "create",
      before: null,
      beforeUpdatedAt: null,
      beforeRev: null,
      after: NEW_TASK,
    })
  })

  it("不给现状按从没有过处理", () => {
    expect(createChange("task", "t-1", NEW_TASK)).toEqual(createChange("task", "t-1", NEW_TASK, null))
  })

  it("库里有已删除的同编号记录：给它删除时的修改时间和写入顺序号", () => {
    const existing: RecordVersion = { value: null, updatedAt: 500, rev: 7, deleted: true }
    const change = createChange("task", "t-1", NEW_TASK, existing)
    expect(change.action).toBe("create")
    expect(change.before).toBeNull()
    expect(change.beforeUpdatedAt).toBe(500)
    expect(change.beforeRev).toBe(7)
    expect(change.after).toBe(NEW_TASK)
  })

  it("没删除说明编号撞了，抛普通 Error（程序错误，不是 ToolInputError）", () => {
    const existing: RecordVersion = { value: { id: "t-1" }, updatedAt: 500, rev: 7, deleted: false }
    expect(() => createChange("task", "t-1", NEW_TASK, existing)).toThrow(Error)
    expect(() => createChange("task", "t-1", NEW_TASK, existing)).toThrow(/already exists/)
  })
})

describe("updateChange / deleteChange", () => {
  const current: Versioned<{ id: string; title: string }> = {
    value: { id: "t-1", title: "Old" },
    updatedAt: 123,
    rev: 5,
  }

  it("update 带上改前内容和版本，冲突检查用写入顺序号", () => {
    const after = { id: "t-1", title: "New" }
    expect(updateChange("task", "t-1", current, after)).toEqual({
      kind: "task",
      id: "t-1",
      action: "update",
      before: { id: "t-1", title: "Old" },
      beforeUpdatedAt: 123,
      beforeRev: 5,
      after,
    })
  })

  it("delete 的 after 为 null，before 系列同 update", () => {
    expect(deleteChange("task", "t-1", current)).toEqual({
      kind: "task",
      id: "t-1",
      action: "delete",
      before: { id: "t-1", title: "Old" },
      beforeUpdatedAt: 123,
      beforeRev: 5,
      after: null,
    })
  })
})

describe("singletonChange", () => {
  const profile: Profile = { name: "A", weekdayMin: 120, weekendMin: 240, dayStartHour: 8, dayEndHour: 22 }
  const never: SingletonVersion<Profile> = { value: null, updatedAt: null, rev: null }
  const existing: SingletonVersion<Profile> = { value: profile, updatedAt: 99, rev: 3 }

  it("现状和目标一样（键顺序无关）返回 null", () => {
    const reordered: Profile = { dayEndHour: 22, dayStartHour: 8, weekendMin: 240, weekdayMin: 120, name: "A" }
    expect(singletonChange("profile", existing, reordered)).toBeNull()
    expect(singletonChange("profile", never, null)).toBeNull()
  })

  it("库里从没有过、目标有值 → create，SINGLETON_ID，before 系列为 null", () => {
    const change: PlannedChange | null = singletonChange("profile", never, profile)
    expect(change).toEqual({
      kind: "profile",
      id: "singleton",
      action: "create",
      before: null,
      beforeUpdatedAt: null,
      beforeRev: null,
      after: profile,
    })
  })

  it("现状有值、目标为 null → delete", () => {
    const change = singletonChange("profile", existing, null)
    expect(change).toEqual({
      kind: "profile",
      id: "singleton",
      action: "delete",
      before: profile,
      beforeUpdatedAt: 99,
      beforeRev: 3,
      after: null,
    })
  })

  it("现状有值、目标不同 → update；键顺序无关的相等仍算一样", () => {
    const next: Profile = { ...profile, weekdayMin: 150 }
    const change = singletonChange("profile", existing, next)
    expect(change).toEqual({
      kind: "profile",
      id: "singleton",
      action: "update",
      before: profile,
      beforeUpdatedAt: 99,
      beforeRev: 3,
      after: next,
    })
    // 计时器也是单例
    const timerChange = singletonChange("timer", { value: { taskId: "t-1", projectId: null, label: "", startedAt: 1 }, updatedAt: 1, rev: 1 }, null)
    expect(timerChange?.action).toBe("delete")
    expect(timerChange?.id).toBe("singleton")
  })

  it("嵌套内容不同不算一样", () => {
    const withSubtasks: SingletonVersion<{ subtasks: { done: boolean }[] }> = {
      value: { subtasks: [{ done: true }, { done: false }] },
      updatedAt: 1,
      rev: 1,
    }
    expect(singletonChange("timer", withSubtasks, { subtasks: [{ done: false }, { done: true }] })).not.toBeNull()
    expect(singletonChange("timer", withSubtasks, { subtasks: [{ done: true }, { done: false }] })).toBeNull()
  })
})

describe("structurallyEqual", () => {
  it("键顺序无关、嵌套结构、数组顺序敏感", () => {
    expect(structurallyEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(structurallyEqual({ a: { b: [1, { c: 3 }] } }, { a: { b: [1, { c: 3 }] } })).toBe(true)
    expect(structurallyEqual([1, 2], [2, 1])).toBe(false)
    expect(structurallyEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(structurallyEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(structurallyEqual("1", 1)).toBe(false)
    expect(structurallyEqual(null, undefined)).toBe(false)
    expect(structurallyEqual(0, false)).toBe(false)
  })
})
