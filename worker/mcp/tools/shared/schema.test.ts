import { describe, expect, it } from "vitest"
import {
  DAY,
  ESTIMATE_MIN,
  LIMIT,
  LOCAL_DATETIME,
  LOCAL_DATETIME_OR_TIME,
  NOTES,
  PRIORITY,
  PROJECT_REF,
  REASON,
  ROUTINE_REF,
  TASK_REF,
  TASK_STATUS,
  TASK_TITLE,
  TIME,
} from "./schema"

describe("schema 片段", () => {
  it("日期、时间、日期加时间的形状", () => {
    expect(DAY).toMatchObject({ type: "string", description: expect.stringContaining("YYYY-MM-DD") })
    expect(TIME).toMatchObject({ type: "string", description: expect.stringContaining("HH:mm") })
    expect(LOCAL_DATETIME).toMatchObject({ type: "string", description: expect.stringContaining("YYYY-MM-DDTHH:mm") })
    // 两种写法都要在说明里点出来
    expect(LOCAL_DATETIME_OR_TIME.description).toContain("YYYY-MM-DDTHH:mm")
    expect(LOCAL_DATETIME_OR_TIME.description).toContain("HH:mm")
  })

  it("取值范围的片段", () => {
    expect(PRIORITY).toEqual({ type: "integer", minimum: 0, maximum: 4, description: expect.any(String) })
    expect(ESTIMATE_MIN).toEqual({ type: "integer", minimum: 0, maximum: 1440, description: expect.any(String) })
    expect(TASK_TITLE).toEqual({ type: "string", minLength: 1, maxLength: 80, description: expect.any(String) })
    expect(NOTES).toEqual({ type: "string", maxLength: 2000, description: expect.any(String) })
    expect(REASON).toEqual({ type: "string", maxLength: 200, description: expect.any(String) })
  })

  it("任务状态枚举取自领域类型", () => {
    expect(TASK_STATUS.enum).toEqual(["backlog", "todo", "doing", "done", "dropped"])
    // 编译期就钉住：领域类型多出或少了状态，这里的字面量类型会不匹配
    const statuses: readonly string[] = TASK_STATUS.enum
    expect(new Set(statuses).size).toBe(statuses.length)
  })

  it("引用片段是可空或非空字符串，说明写清匹配规则", () => {
    expect(PROJECT_REF.type).toEqual(["string", "null"])
    expect(PROJECT_REF.description).toContain("null")
    expect(TASK_REF.type).toBe("string")
    expect(TASK_REF.description).toContain("T-123")
    expect(ROUTINE_REF.type).toBe("string")
    for (const ref of [PROJECT_REF, ROUTINE_REF]) {
      expect(ref.description).toContain("exact match")
      expect(ref.description).toContain("prefix")
    }
  })

  it("LIMIT 生成带默认值和上限的条数片段", () => {
    expect(LIMIT(50, 100)).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 50,
      description: "Number of records to return, 1–100 (default 50).",
    })
    expect(LIMIT(8, 20).maximum).toBe(20)
  })

  it("每个片段都带英文 description", () => {
    const fragments: unknown[] = [DAY, TIME, LOCAL_DATETIME, LOCAL_DATETIME_OR_TIME, PRIORITY, TASK_STATUS, ESTIMATE_MIN, TASK_TITLE, NOTES, REASON, PROJECT_REF, TASK_REF, ROUTINE_REF, LIMIT(1, 5)]
    for (const fragment of fragments) {
      expect(fragment).toMatchObject({ description: expect.stringMatching(/^[A-Z]/) })
    }
  })
})
