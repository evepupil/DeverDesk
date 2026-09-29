import { afterEach, describe, expect, it } from "vitest"

import { ENTRY_STATUS, PRIORITY, TASK_STATUS, categoryLabel, currencyLabel } from "@/data/catalog"
import { formatAgo, formatDayLong, formatMonthDay, formatMonthLabel, formatRelativeDay, weekdayLabel } from "@/domain/calendar"
import { amountUnit, formatAmount, formatAmountCompact, formatMinutesLong, formatPointDelta, formatSignedAmount, profileCurrency } from "@/domain/format"
import { WORKBENCH_PAGES, WORKBENCH_VIEWS } from "@/features/shell/nav"
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, detectLocale, isLocale } from "./locales"
import { getLocale, getT, setCurrency, setLocale, subscribeLocale } from "./runtime"

afterEach(() => {
  setLocale(DEFAULT_LOCALE)
  setCurrency(DEFAULT_CURRENCY)
})

describe("猜语言", () => {
  it("浏览器语言以 zh 开头用中文", () => {
    expect(detectLocale(["zh-TW", "en-US"])).toBe("zh-CN")
    expect(detectLocale(["zh"])).toBe("zh-CN")
  })

  it("英文和其它语言用英文，按浏览器给的先后判断", () => {
    expect(detectLocale(["en-GB"])).toBe("en")
    expect(detectLocale(["ja-JP"])).toBe("en")
    expect(detectLocale(["en-US", "zh-CN"])).toBe("en")
  })

  it("拿不到浏览器语言时用默认语言", () => {
    expect(detectLocale([])).toBe(DEFAULT_LOCALE)
  })

  it("只认支持的语言代码", () => {
    expect(isLocale("en")).toBe(true)
    expect(isLocale("zh-CN")).toBe(true)
    expect(isLocale("fr")).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe("切换语言", () => {
  it("切换后通知订阅者，同一种语言不重复通知", () => {
    let calls = 0
    const unsubscribe = subscribeLocale(() => calls++)
    setLocale("en")
    setLocale("en")
    expect(getLocale()).toBe("en")
    expect(calls).toBe(1)
    unsubscribe()
    setLocale("zh-CN")
    expect(calls).toBe(1)
  })

  it("两种语言的词条是同一套形状", () => {
    const keysOf = (value: unknown): string[] =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child).map((sub) => `${key}.${sub}`)])
        : []
    const zh = keysOf(getT()).sort()
    setLocale("en")
    expect(keysOf(getT()).sort()).toEqual(zh)
  })
})

describe("日期按语言输出", () => {
  it("中文", () => {
    expect(formatMonthDay("2026-09-30")).toBe("9月30日")
    expect(weekdayLabel("2026-09-30")).toBe("周三")
    expect(formatDayLong("2026-09-30")).toBe("9月30日 周三")
    expect(formatMonthLabel("2026-09-30")).toBe("9月")
    expect(formatMonthLabel("2026-09-30", true)).toBe("2026年9月")
    expect(formatRelativeDay("2026-10-01", "2026-09-30")).toBe("明天")
  })

  it("英文", () => {
    setLocale("en")
    expect(formatMonthDay("2026-09-30")).toBe("Sep 30")
    expect(weekdayLabel("2026-09-30")).toBe("Wed")
    expect(formatDayLong("2026-09-30")).toBe("Wed, Sep 30")
    expect(formatMonthLabel("2026-09-30")).toBe("Sep")
    expect(formatMonthLabel("2026-09-30", true)).toBe("Sep 2026")
    expect(formatRelativeDay("2026-09-30", "2026-09-30")).toBe("Today")
    expect(formatRelativeDay("2026-09-29", "2026-09-30")).toBe("Yesterday")
    expect(formatRelativeDay("2026-10-02", "2026-09-30")).toBe("In 2 days")
  })

  it("多久以前", () => {
    const now = new Date(2026, 8, 30, 15, 0).getTime()
    setLocale("en")
    expect(formatAgo(now - 20_000, now)).toBe("Just now")
    expect(formatAgo(now - 12 * 60_000, now)).toBe("12 min ago")
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe("3 hr ago")
    expect(formatAgo(new Date(2026, 8, 29, 9, 0).getTime(), now)).toBe("Yesterday")
    expect(formatAgo(new Date(2026, 8, 26, 9, 0).getTime(), now)).toBe("4 days ago")
    setLocale("zh-CN")
    expect(formatAgo(now - 12 * 60_000, now)).toBe("12 分钟前")
  })
})

describe("时长和金额按语言输出", () => {
  it("时长全写", () => {
    expect(formatMinutesLong(90)).toBe("1 小时 30 分钟")
    setLocale("en")
    expect(formatMinutesLong(45)).toBe("45 min")
    expect(formatMinutesLong(120)).toBe("2 hr")
    expect(formatMinutesLong(90)).toBe("1 hr 30 min")
  })

  it("百分点", () => {
    expect(formatPointDelta(0.004)).toBe("+0.4 个点")
    expect(formatPointDelta(0)).toBe("持平")
    setLocale("en")
    expect(formatPointDelta(-0.004)).toBe("−0.4 pts")
    expect(formatPointDelta(0)).toBe("Flat")
  })

  it("金额跟着语言和记账币种", () => {
    expect(formatAmount(1280)).toBe("¥1,280")
    expect(formatAmount(19.9)).toBe("¥19.9")
    setLocale("en")
    expect(formatAmount(1280)).toBe("CN¥1,280")
    setCurrency("USD")
    expect(formatAmount(1280.5)).toBe("$1,280.5")
    expect(formatSignedAmount(-12)).toBe("−$12")
  })

  it("坐标轴上的紧凑金额", () => {
    expect(formatAmountCompact(36567)).toBe("¥3.7万")
    expect(formatAmountCompact(-3500)).toBe("−¥3500")
    setLocale("en")
    expect(formatAmountCompact(36567)).toBe("CN¥36.6K")
    setCurrency("USD")
    expect(formatAmountCompact(1234567)).toBe("$1.2M")
  })

  it("金额输入框的单位", () => {
    expect(amountUnit()).toBe("元")
    setCurrency("USD")
    expect(amountUnit()).toBe("US$")
    setLocale("en")
    expect(amountUnit()).toBe("$")
    setCurrency("CNY")
    expect(amountUnit()).toBe("CN¥")
  })

  it("认不出的币种代码按默认币种显示", () => {
    setCurrency("NOT-A-CODE")
    expect(formatAmount(10)).toBe("¥10")
  })

  it("个人设置没有币种时按默认币种", () => {
    expect(profileCurrency({})).toBe(DEFAULT_CURRENCY)
    expect(profileCurrency({ currency: "USD" })).toBe("USD")
  })
})

describe("固定叫法按语言现取", () => {
  it("状态、优先级、分类、币种", () => {
    expect(TASK_STATUS.todo.label).toBe("待办")
    expect(PRIORITY[4].label).toBe("紧急")
    expect(categoryLabel("server")).toBe("服务器")
    expect(currencyLabel("USD")).toBe("美元")
    setLocale("en")
    expect(TASK_STATUS.todo.label).toBe("To do")
    expect(PRIORITY[2].short).toBe("Med")
    expect(ENTRY_STATUS.pending.label).toBe("Pending")
    expect(categoryLabel("other-income")).toBe("Other income")
    expect(categoryLabel("unknown")).toBe("unknown")
    expect(currencyLabel("XYZ")).toBe("XYZ")
  })

  it("导航的页面名和视图名", () => {
    expect(WORKBENCH_PAGES.map((page) => page.label)).toContain("收支")
    setLocale("en")
    expect(WORKBENCH_PAGES.find((page) => page.key === "ledger")?.label).toBe("Ledger")
    expect(WORKBENCH_VIEWS.find((view) => view.key === "pending")?.label).toBe("Awaiting payment")
  })
})
