import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import { assertDay, assertRange, assertTime } from "./dates"
import { ToolInputError } from "../../types"

beforeAll(() => {
  process.env.TZ = "UTC"
})

function inputErrorOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof ToolInputError) return error.message
    throw error
  }
  throw new Error("expected ToolInputError")
}

describe("assertDay", () => {
  it("真实存在的日期原样返回", () => {
    expect(assertDay("2026-02-28", "date")).toBe("2026-02-28")
    expect(assertDay("2024-02-29", "date")).toBe("2024-02-29")
  })

  it("不存在的日期被拒：平年二月三十、四月三十一、十三月、三十二日", () => {
    for (const value of ["2026-02-30", "2026-04-31", "2026-13-01", "2026-01-32", "2023-02-29"]) {
      expect(inputErrorOf(() => assertDay(value, "date"))).toContain(`Invalid date "${value}" for "date"`)
    }
  })

  it("格式不对被拒：缺零、斜杠、多字、空串", () => {
    for (const value of ["2026-2-1", "2026/02/01", "2026-02-011", "", "20260201"]) {
      expect(inputErrorOf(() => assertDay(value, "dueOn"))).toContain('for "dueOn"')
    }
  })
})

describe("assertTime", () => {
  it("合法时间原样返回，含边界 00:00 和 23:59", () => {
    expect(assertTime("00:00", "startAt")).toBe("00:00")
    expect(assertTime("09:30", "startAt")).toBe("09:30")
    expect(assertTime("23:59", "startAt")).toBe("23:59")
  })

  it("越界和格式不对被拒", () => {
    for (const value of ["24:00", "23:60", "9:30", "09:5", "0930", "09:30:00", ""]) {
      expect(inputErrorOf(() => assertTime(value, "startAt"))).toContain(`Invalid time "${value}" for "startAt"`)
    }
  })
})

describe("assertRange", () => {
  it("start ≤ end 且跨度不超过上限时通过", () => {
    expect(() => assertRange("2026-03-01", "2026-03-01", 366, "range")).not.toThrow()
    expect(() => assertRange("2026-01-01", "2027-01-01", 366, "range")).not.toThrow()
  })

  it("start 晚于 end 被拒", () => {
    expect(inputErrorOf(() => assertRange("2026-03-02", "2026-03-01", 366, "range"))).toBe(
      'Invalid range for "range": start 2026-03-02 is after end 2026-03-01.'
    )
  })

  it("跨度超过上限被拒：367 天超过 366，366 天正好", () => {
    expect(inputErrorOf(() => assertRange("2026-01-01", "2027-01-03", 366, "range"))).toBe(
      'Date range for "range" is too long: 2026-01-01 to 2027-01-03 spans more than 366 days.'
    )
    expect(() => assertRange("2026-01-01", "2027-01-02", 366, "range")).not.toThrow()
  })
})
