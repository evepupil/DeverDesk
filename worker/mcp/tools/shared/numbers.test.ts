import { describe, expect, it } from "vitest"
import { roundMoney } from "./numbers"

describe("roundMoney", () => {
  it("把加法产生的浮点尾数收回到分", () => {
    expect(88.8 + 19.99).not.toBe(108.79)
    expect(roundMoney(88.8 + 19.99)).toBe(108.79)
    expect(roundMoney(108.78999999999999 - 47.5)).toBe(61.29)
  })

  it("本来就是整分的金额保持不变", () => {
    expect(roundMoney(12.5)).toBe(12.5)
    expect(roundMoney(300)).toBe(300)
    expect(roundMoney(-12.5)).toBe(-12.5)
  })

  it("除不尽的时薪取两位小数", () => {
    expect(roundMoney(320 / 1.5)).toBe(213.33)
    expect(roundMoney(73.72 / (111 / 60))).toBe(39.85)
  })

  it("极小的残差归零，且不出现 -0", () => {
    expect(Object.is(roundMoney(-0.0000001), 0)).toBe(true)
    expect(Object.is(roundMoney(0), 0)).toBe(true)
  })
})
