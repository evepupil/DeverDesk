import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { setLocale } from "../i18n/runtime"
import { parseQuickAdd } from "./quick-add"
import type { DayKey, Project } from "./types"

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai"
})

const projects: Project[] = [
  {
    id: "p-blog",
    name: "技术博客",
    color: "blue",
    stage: "running",
    goal: "",
    startedOn: "2026-01-01",
    monthlyTarget: null,
    milestones: [],
  },
  {
    id: "p-app",
    name: "小应用",
    color: "teal",
    stage: "building",
    goal: "",
    startedOn: "2026-02-01",
    monthlyTarget: null,
    milestones: [],
  },
]

/** 2026-09-30 是周三 */
const TODAY: DayKey = "2026-09-30"

function parse(input: string, today: DayKey = TODAY) {
  return parseQuickAdd(input, projects, today)
}

describe("parseQuickAdd 时长", () => {
  it("30m → 30 分钟", () => {
    expect(parse("写周报 30m").estimateMin).toBe(30)
  })

  it("45分钟 → 45 分钟", () => {
    expect(parse("写周报 45分钟").estimateMin).toBe(45)
  })

  it("1.5h → 90 分钟", () => {
    expect(parse("写周报 1.5h").estimateMin).toBe(90)
  })

  it("2小时 → 120 分钟", () => {
    expect(parse("写周报 2小时").estimateMin).toBe(120)
  })

  it("1h30m → 90 分钟", () => {
    expect(parse("写周报 1h30m").estimateMin).toBe(90)
  })

  it("只识别第一个时长，后面的留在标题里", () => {
    const result = parse("写周报 30m 45m")
    expect(result.estimateMin).toBe(30)
    expect(result.title).toBe("写周报 45m")
  })

  it("没有时长标记时 estimateMin 为 null", () => {
    expect(parse("写周报").estimateMin).toBeNull()
  })
})

describe("parseQuickAdd 副业", () => {
  it("#技术 按名称开头匹配到「技术博客」", () => {
    const result = parse("写周报 #技术")
    expect(result.projectId).toBe("p-blog")
    expect(result.title).toBe("写周报")
  })

  it("匹配不到的 #xxx 留在标题里", () => {
    const result = parse("写周报 #xxx")
    expect(result.projectId).toBeNull()
    expect(result.title).toBe("写周报 #xxx")
  })
})

describe("parseQuickAdd 日期", () => {
  it("今天 → 当天", () => {
    expect(parse("写周报 今天").plannedFor).toBe("2026-09-30")
  })

  it("明天 → 2026-10-01", () => {
    expect(parse("写周报 明天").plannedFor).toBe("2026-10-01")
  })

  it("后天 → 2026-10-02", () => {
    expect(parse("写周报 后天").plannedFor).toBe("2026-10-02")
  })

  it("周五：今天周三，之后最近的周五是 2026-10-02", () => {
    expect(parse("写周报 周五").plannedFor).toBe("2026-10-02")
  })

  it("周五：今天就是周五时是今天", () => {
    expect(parse("写周报 周五", "2026-10-02").plannedFor).toBe("2026-10-02")
  })

  it("下周二：今天周三，下周二是 2026-10-06", () => {
    expect(parse("写周报 下周二").plannedFor).toBe("2026-10-06")
  })

  it("10-3：今年还没到，算今年 2026-10-03", () => {
    expect(parse("写周报 10-3").plannedFor).toBe("2026-10-03")
  })

  it("10月3日 → 2026-10-03", () => {
    expect(parse("写周报 10月3日").plannedFor).toBe("2026-10-03")
  })

  it("已过去的日期算到明年：今天 2026-10-05 输入 10-3 → 2027-10-03", () => {
    expect(parse("写周报 10-3", "2026-10-05").plannedFor).toBe("2027-10-03")
  })

  it("没有日期标记时 plannedFor 为 null", () => {
    expect(parse("写周报").plannedFor).toBeNull()
  })
})

describe("parseQuickAdd 优先级", () => {
  it("! → 2（中）", () => {
    expect(parse("写周报 !").priority).toBe(2)
  })

  it("!! → 3（高）", () => {
    expect(parse("写周报 !!").priority).toBe(3)
  })

  it("!!! → 4（紧急）", () => {
    expect(parse("写周报 !!!").priority).toBe(4)
  })

  it("没有优先级标记时为 null", () => {
    expect(parse("写周报").priority).toBeNull()
  })
})

describe("parseQuickAdd 标题", () => {
  it("标题是去掉所有标记后剩下的文字", () => {
    const result = parse("写周报 30m #技术 明天 !!")
    expect(result.title).toBe("写周报")
    expect(result.estimateMin).toBe(30)
    expect(result.projectId).toBe("p-blog")
    expect(result.plannedFor).toBe("2026-10-01")
    expect(result.priority).toBe(3)
  })

  it("只有标记没有文字时标题为空字符串", () => {
    expect(parse("30m 明天 !!").title).toBe("")
  })
})

describe("parseQuickAdd 英文写法（不管界面语言都认）", () => {
  afterEach(() => setLocale("zh-CN"))

  it("时长：2hr、45min、90 minutes 的写法", () => {
    expect(parse("Fix bug 2hr").estimateMin).toBe(120)
    expect(parse("Fix bug 45min").estimateMin).toBe(45)
    expect(parse("Fix bug 90minutes").estimateMin).toBe(90)
    expect(parse("Fix bug 1.5hours").estimateMin).toBe(90)
  })

  it("日期：today、tomorrow、tmr", () => {
    expect(parse("Ship today").plannedFor).toBe("2026-09-30")
    expect(parse("Ship tomorrow").plannedFor).toBe("2026-10-01")
    expect(parse("Ship tmr").plannedFor).toBe("2026-10-01")
  })

  it("日期：星期几取本周或之后最近的一天", () => {
    expect(parse("Call fri").plannedFor).toBe("2026-10-02")
    expect(parse("Call Friday").plannedFor).toBe("2026-10-02")
    expect(parse("Call wed").plannedFor).toBe("2026-09-30")
    expect(parse("Call mon").plannedFor).toBe("2026-10-05")
  })

  it("日期：next tue 两个词、next-tue 一个词都是下周", () => {
    const spaced = parse("Plan next tue 30m")
    expect(spaced.plannedFor).toBe("2026-10-06")
    expect(spaced.title).toBe("Plan")
    expect(parse("Plan next-thu").plannedFor).toBe("2026-10-08")
  })

  it("普通英文单词不当成日期", () => {
    const result = parse("Write the next chapter")
    expect(result.plannedFor).toBeNull()
    expect(result.title).toBe("Write the next chapter")
  })

  it("中英文混写", () => {
    const result = parse("写周报 30m #技术博客 tomorrow !!")
    expect(result).toMatchObject({ title: "写周报", estimateMin: 30, projectId: "p-blog", plannedFor: "2026-10-01", priority: 3 })
  })

  it("识别出的标记按当前语言显示", () => {
    expect(parse("Ship tomorrow 90m !!!").tokens.map((token) => token.label)).toEqual(["明天", "1.5 小时", "紧急"])
    setLocale("en")
    expect(parse("Ship tomorrow 90m !!!").tokens.map((token) => token.label)).toEqual(["Tomorrow", "1.5 hr", "Urgent"])
  })
})
