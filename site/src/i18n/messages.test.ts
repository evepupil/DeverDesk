import { describe, expect, it } from "vitest"
import { fill, getMessages } from "./index"
import { en } from "./messages/en"
import { zh } from "./messages/zh"

/** 逐层比较两份词条：键一样、数组一样长、同一条里的 {占位} 一样 */
function compare(a: unknown, b: unknown, path: string, problems: string[]) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return problems.push(`${path}：一边是数组一边不是`)
    if (a.length !== b.length) problems.push(`${path}：数组长度 ${a.length} ≠ ${b.length}`)
    a.forEach((item, index) => compare(item, b[index], `${path}[${index}]`, problems))
    return
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const keysA = Object.keys(a).sort()
    const keysB = Object.keys(b).sort()
    if (keysA.join() !== keysB.join()) problems.push(`${path}：键不一致`)
    for (const key of keysA) compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`, problems)
    return
  }
  if (typeof a === "string" && typeof b === "string") {
    const slots = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join()
    if (slots(a) !== slots(b)) problems.push(`${path}：占位不一致（${slots(a)} / ${slots(b)}）`)
    if (a.trim() === "" || b.trim() === "") problems.push(`${path}：有空字符串`)
    return
  }
  if (typeof a !== typeof b) problems.push(`${path}：类型不一致`)
}

describe("词条", () => {
  it("中英文结构、数组长度、占位逐条对齐", () => {
    const problems: string[] = []
    compare(zh, en, "messages", problems)
    expect(problems).toEqual([])
  })

  it("按语言取词条", () => {
    expect(getMessages("zh").nav.blog).toBe("博客")
    expect(getMessages("en").nav.blog).toBe("Blog")
  })

  it("首页插画的数据条数固定", () => {
    expect(zh.home.features.rate.rows).toHaveLength(3)
    expect(zh.home.features.money.items).toHaveLength(3)
    expect(zh.home.features.quickAdd.chips).toHaveLength(4)
    expect(zh.home.features.today.blocks).toHaveLength(3)
    expect(zh.home.scenarios.cards).toHaveLength(10)
  })
})

describe("fill", () => {
  it("替换占位，没给的保留", () => {
    expect(fill("{n} 个版本", { n: 5 })).toBe("5 个版本")
    expect(fill("最近更新 {date}", { date: "9月30日" })).toBe("最近更新 9月30日")
    expect(fill("{a} 和 {b}", { a: "甲" })).toBe("甲 和 {b}")
  })
})
