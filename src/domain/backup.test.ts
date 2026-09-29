import { beforeAll, describe, expect, it } from "vitest"
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup, toBackup } from "./backup"
import type { WorkbenchData } from "./types"

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai"
})

const data: WorkbenchData = {
  profile: {
    name: "阿禾",
    weekdayMin: 180,
    weekendMin: 300,
    dayStartHour: 8,
    dayEndHour: 23,
  },
  projects: [
    {
      id: "p1",
      name: "技术博客",
      color: "blue",
      stage: "running",
      goal: "每周一篇",
      startedOn: "2026-01-01",
      monthlyTarget: 500,
      milestones: [{ id: "m1", title: "第 10 篇", due: "2026-11-01", doneOn: null }],
    },
  ],
  tasks: [
    {
      id: "t1",
      seq: 101,
      title: "写周报",
      projectId: "p1",
      status: "todo",
      priority: 3,
      estimateMin: 30,
      plannedFor: "2026-09-30",
      startAt: "09:00",
      dueOn: "2026-10-05",
      notes: "",
      subtasks: [{ id: "s1", title: "列提纲", done: false }],
      createdAt: 1000,
      completedAt: null,
    },
  ],
  entries: [{ id: "e1", taskId: "t1", projectId: "p1", start: 1000, end: 1900 }],
  ledger: [
    {
      id: "l1",
      kind: "income",
      amount: 299,
      projectId: "p1",
      category: "sales",
      channel: "alipay",
      status: "pending",
      date: "2026-09-15",
      expectedOn: "2026-10-01",
      note: "模板卖了一单",
      createdAt: 2000,
    },
  ],
  routines: [
    {
      id: "r1",
      title: "晨间记账户",
      cadence: "daily",
      estimateMin: 10,
      projectId: null,
      doneOn: ["2026-09-29"],
      createdOn: "2026-09-01",
      archived: false,
    },
  ],
  notes: [{ week: "2026-09-28", wins: "都做完了", improve: "少熬夜", next: "写第 10 篇" }],
  timer: { taskId: "t1", projectId: "p1", label: "写周报", startedAt: 3000 },
}

describe("toBackup / parseBackup 往返", () => {
  it("导出后再导入能原样还原（计时器为 null）", () => {
    const backup = toBackup(data, 1_700_000_000_000)
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(BACKUP_VERSION)
    const result = parseBackup(JSON.stringify(backup))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({ ...data, timer: null })
    expect(result.data.profile).toEqual(data.profile)
    expect(result.data.projects).toEqual(data.projects)
    expect(result.data.tasks).toEqual(data.tasks)
    expect(result.data.entries).toEqual(data.entries)
    expect(result.data.ledger).toEqual(data.ledger)
    expect(result.data.routines).toEqual(data.routines)
    expect(result.data.notes).toEqual(data.notes)
  })

  it("还原后计时器一律为 null", () => {
    const backup = toBackup(data, 1_700_000_000_000)
    const result = parseBackup(JSON.stringify(backup))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.timer).toBeNull()
  })
})

describe("parseBackup 错误", () => {
  it("不是 JSON 时返回「文件不是有效的 JSON」", () => {
    const result = parseBackup("{oops")
    expect(result).toEqual({ ok: false, error: "文件不是有效的 JSON" })
  })

  it("格式标记不对时返回「这不是工作台导出的备份文件」", () => {
    const result = parseBackup(JSON.stringify({ format: "other-app", version: 1, data }))
    expect(result).toEqual({ ok: false, error: "这不是工作台导出的备份文件" })
  })

  it("版本不对时返回「备份文件的版本不认识」", () => {
    const result = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 999, data }))
    expect(result).toEqual({ ok: false, error: "备份文件的版本不认识" })
  })

  it.each(["projects", "tasks", "entries", "ledger", "routines", "notes"] as const)(
    "缺列表 %s 时返回「备份文件缺少「%s」」",
    (key) => {
      const partial: Record<string, unknown> = { ...data }
      delete partial[key]
      const result = parseBackup(
        JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, data: partial })
      )
      expect(result).toEqual({ ok: false, error: `备份文件缺少「${key}」` })
    }
  )

  it("作息设置不完整时返回「备份文件里的作息设置不完整」", () => {
    const result = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        data: { ...data, profile: { name: "阿禾", weekdayMin: 180 } },
      })
    )
    expect(result).toEqual({ ok: false, error: "备份文件里的作息设置不完整" })
  })

  it("data 整个缺失时返回「备份文件里没有数据」", () => {
    const result = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION }))
    expect(result).toEqual({ ok: false, error: "备份文件里没有数据" })
  })
})
