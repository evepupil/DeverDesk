import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import type { Clock } from "../../types"
import type { LedgerEntry, Project, Routine, Task, TimeEntry } from "../../../../src/domain/types"
import { projectRef, presentEntry, presentLedger, presentProject, presentRoutine, presentTask, type PresentContext } from "./present"

beforeAll(() => {
  process.env.TZ = "UTC"
})

/** Asia/Shanghai 的替身时钟：真实毫秒与本地时间的换算用固定 +8 偏移（2026 年 3 月，无夏令时） */
function shanghaiClock(now = 1_772_685_600_000): Clock {
  const OFFSET = 8 * 3_600_000
  const pad = (value: number) => String(value).padStart(2, "0")
  const parts = (ms: number) => {
    const date = new Date(ms + OFFSET)
    return {
      day: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
      time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
    }
  }
  return {
    timeZone: "Asia/Shanghai",
    timeZoneKnown: true,
    now,
    today: parts(now).day,
    dayOf: (ms) => parts(ms).day,
    startOfDay: (day) => Date.parse(`${day}T00:00:00Z`) - OFFSET,
    toWall: (ms) => ms + OFFSET,
    fromWall: (wall) => wall - OFFSET,
    parseLocal: (text) => Date.parse(`${text}:00Z`) - OFFSET,
    formatLocal: (ms) => `${parts(ms).day} ${parts(ms).time}`,
    formatLocalTime: (ms) => parts(ms).time,
    minuteOfDay: (ms) => {
      const date = new Date(ms + OFFSET)
      return date.getUTCHours() * 60 + date.getUTCMinutes()
    },
  }
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    seq: 123,
    title: "写周报",
    projectId: null,
    status: "todo",
    priority: 3,
    estimateMin: 30,
    plannedFor: "2026-03-02",
    startAt: "09:30",
    dueOn: "2026-03-06",
    notes: "",
    subtasks: [
      { id: "s-1", title: "收集数据", done: true },
      { id: "s-2", title: "写结论", done: false },
    ],
    createdAt: 0,
    completedAt: null,
    ...overrides,
  }
}

function ledger(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "l-1",
    kind: "income",
    amount: 1200.5,
    projectId: "p-blog",
    category: "sales",
    channel: "alipay",
    status: "received",
    date: "2026-03-01",
    expectedOn: null,
    note: "稿费",
    createdAt: 0,
    ...overrides,
  }
}

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: "e-1",
    taskId: "t-1",
    projectId: "p-blog",
    // 2026-03-01 09:00–10:30 Asia/Shanghai = 01:00–02:30 UTC
    start: Date.parse("2026-03-01T01:00:00Z"),
    end: Date.parse("2026-03-01T02:30:00Z"),
    ...overrides,
  }
}

const PROJECTS: Project[] = [
  { id: "p-blog", name: "Blog", color: "blue", stage: "running", goal: "写文章", startedOn: "2026-01-01", monthlyTarget: 500, milestones: [] },
]

function context(clock = shanghaiClock(), projects: Project[] = PROJECTS): PresentContext {
  return { clock, projects: new Map(projects.map((project) => [project.id, project])) }
}

describe("projectRef", () => {
  it("查到给 id 和名称，null 给 null", () => {
    expect(projectRef("p-blog", context())).toEqual({ id: "p-blog", name: "Blog" })
    expect(projectRef(null, context())).toBeNull()
  })

  it("查不到的副业编号显示为已删除的副业", () => {
    expect(projectRef("p-gone", context())).toEqual({ id: "p-gone", name: "(deleted project)" })
  })
})

describe("presentTask", () => {
  it("输出统一形状的全部固定字段，时间戳按本地时间格式化", () => {
    const completed = task({
      projectId: "p-blog",
      status: "done",
      completedAt: Date.parse("2026-03-02T03:05:00Z"), // 本地 2026-03-02 11:05
    })
    expect(presentTask(completed, context())).toEqual({
      id: "t-1",
      code: "T-123",
      title: "写周报",
      status: "done",
      priority: 3,
      project: { id: "p-blog", name: "Blog" },
      estimateMin: 30,
      plannedFor: "2026-03-02",
      startAt: "09:30",
      dueOn: "2026-03-06",
      subtasks: { done: 1, total: 2 },
      completedAt: "2026-03-02 11:05",
    })
  })

  it("completedAt 为 null 时给 null；无副业给 null", () => {
    const output = presentTask(task(), context())
    expect(output.completedAt).toBeNull()
    expect(output.project).toBeNull()
  })

  it("loggedMin 只在传了才给", () => {
    const output = presentTask(task(), context())
    expect("loggedMin" in output).toBe(false)
    expect(presentTask(task(), context(), 45).loggedMin).toBe(45)
    // 明确传 undefined 也不给
    expect("loggedMin" in presentTask(task(), context(), undefined)).toBe(false)
  })

  it("byAi 只在 origin 是 ai 时出现", () => {
    const human = presentTask(task(), context())
    expect("byAi" in human).toBe(false)
    const byAi = presentTask(task({ origin: "ai" }), context())
    expect(byAi.byAi).toBe(true)
    expect(Object.keys(byAi)).toContain("byAi")
  })

  it("子任务计数按完成数", () => {
    expect(presentTask(task({ subtasks: [] }), context()).subtasks).toEqual({ done: 0, total: 0 })
  })
})

describe("presentLedger", () => {
  it("输出统一形状，含副业引用", () => {
    expect(presentLedger(ledger(), context())).toEqual({
      id: "l-1",
      kind: "income",
      amount: 1200.5,
      project: { id: "p-blog", name: "Blog" },
      category: "sales",
      channel: "alipay",
      status: "received",
      date: "2026-03-01",
      expectedOn: null,
      note: "稿费",
    })
  })

  it("externalId 没有就不出现这个键，有就给", () => {
    expect("externalId" in presentLedger(ledger(), context())).toBe(false)
    const withExternal = presentLedger(ledger({ externalId: "PAY-88" }), context())
    expect(withExternal.externalId).toBe("PAY-88")
  })

  it("byAi 同任务：AI 记的为 true，否则没有这个键", () => {
    expect("byAi" in presentLedger(ledger(), context())).toBe(false)
    expect(presentLedger(ledger({ origin: "ai" }), context()).byAi).toBe(true)
  })
})

describe("presentEntry", () => {
  it("start、end 是本地日期时间，minutes 按真实时间戳算", () => {
    expect(presentEntry(entry(), context(), new Map([[task().id, task()]]))).toEqual({
      id: "e-1",
      start: "2026-03-01 09:00",
      end: "2026-03-01 10:30",
      minutes: 90,
      project: { id: "p-blog", name: "Blog" },
      task: { id: "t-1", code: "T-123", title: "写周报" },
    })
  })

  it("任务在 tasks 里查不到只给 id；没有任务给 null", () => {
    const noTasks = presentEntry(entry(), context())
    expect(noTasks.task).toEqual({ id: "t-1" })

    const orphan = presentEntry(entry({ taskId: "t-gone" }), context(), new Map([["t-1", task()]]))
    expect(orphan.task).toEqual({ id: "t-gone" })

    expect(presentEntry(entry({ taskId: null }), context()).task).toBeNull()
  })

  it("tasks 地图能对上时给 id、code、title", () => {
    const tasks = new Map([[task().id, task()]])
    expect(presentEntry(entry(), context(), tasks).task).toEqual({ id: "t-1", code: "T-123", title: "写周报" })
  })

  it("byAi 同任务；不足一分钟按 minutesOf 四舍五入为一分钟", () => {
    expect("byAi" in presentEntry(entry(), context())).toBe(false)
    expect(presentEntry(entry({ origin: "ai" }), context()).byAi).toBe(true)
    const subMinute = presentEntry(
      entry({ start: Date.parse("2026-03-01T01:00:00Z"), end: Date.parse("2026-03-01T01:00:30Z") }),
      context()
    )
    expect(subMinute.minutes).toBe(1)
  })
})

describe("presentProject", () => {
  it("输出统一形状，不带里程碑等内部字段", () => {
    expect(presentProject(PROJECTS[0])).toEqual({
      id: "p-blog",
      name: "Blog",
      color: "blue",
      stage: "running",
      goal: "写文章",
      monthlyTarget: 500,
      startedOn: "2026-01-01",
    })
    expect("milestones" in presentProject(PROJECTS[0])).toBe(false)
  })
})

describe("presentRoutine", () => {
  it("输出统一形状", () => {
    const routine: Routine = {
      id: "r-1",
      title: "晨会",
      cadence: "weekdays",
      estimateMin: 15,
      projectId: "p-blog",
      doneOn: [],
      createdOn: "2026-01-01",
      archived: false,
    }
    expect(presentRoutine(routine, context())).toEqual({
      id: "r-1",
      title: "晨会",
      cadence: "weekdays",
      estimateMin: 15,
      project: { id: "p-blog", name: "Blog" },
      archived: false,
    })
    expect("doneOn" in presentRoutine(routine, context())).toBe(false)
  })

  it("副业查不到给已删除占位", () => {
    const routine: Routine = { id: "r-1", title: "晨会", cadence: "daily", estimateMin: 10, projectId: "p-gone", doneOn: [], createdOn: "2026-01-01", archived: true }
    expect(presentRoutine(routine, context()).project).toEqual({ id: "p-gone", name: "(deleted project)" })
  })
})
