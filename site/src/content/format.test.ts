import { describe, expect, it } from "vitest"
import { formatCount, formatDate, formatDuration, formatShortDate, isoDay, readingMinutes, shouldShowStars } from "./format"

describe("formatDate", () => {
  it("中英文完整日期", () => {
    expect(formatDate("2026-09-30", "zh")).toBe("2026年9月30日")
    expect(formatDate("2026-09-30", "en")).toBe("Sep 30, 2026")
  })

  it("不带年份的短日期", () => {
    expect(formatShortDate("2026-10-05", "zh")).toBe("10月5日")
    expect(formatShortDate("2026-10-05", "en")).toBe("Oct 5")
  })

  it("机器可读日期原样", () => {
    expect(isoDay("2026-09-30")).toBe("2026-09-30")
  })

  it("格式不对直接报错", () => {
    expect(() => formatDate("30/09/2026", "zh")).toThrow()
  })
})

describe("formatCount", () => {
  it("一千以内原样", () => {
    expect(formatCount(0)).toBe("0")
    expect(formatCount(999)).toBe("999")
  })

  it("千和百万用 k、M，去掉 .0", () => {
    expect(formatCount(1000)).toBe("1k")
    expect(formatCount(1234)).toBe("1.2k")
    expect(formatCount(12345)).toBe("12.3k")
    expect(formatCount(57700)).toBe("57.7k")
    expect(formatCount(1_250_000)).toBe("1.3M")
  })
})

describe("shouldShowStars", () => {
  it("拿不到或少于 100 不显示", () => {
    expect(shouldShowStars(null)).toBe(false)
    expect(shouldShowStars(99)).toBe(false)
    expect(shouldShowStars(100)).toBe(true)
  })
})

describe("readingMinutes", () => {
  it("中文按 400 字一分钟，至少 1 分钟", () => {
    expect(readingMinutes("短", "zh")).toBe(1)
    expect(readingMinutes("字".repeat(1200), "zh")).toBe(3)
  })

  it("英文按 220 词一分钟", () => {
    expect(readingMinutes(Array.from({ length: 660 }, () => "word").join(" "), "en")).toBe(3)
    expect(readingMinutes("a few words", "en")).toBe(1)
  })
})

describe("formatDuration", () => {
  it("分钟、小时和混合写法", () => {
    expect(formatDuration(30)).toBe("30m")
    expect(formatDuration(75)).toBe("1h 15m")
    expect(formatDuration(120)).toBe("2h")
    expect(formatDuration(0)).toBe("0m")
  })
})
