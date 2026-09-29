import { afterEach, describe, expect, it } from "vitest"
import { blankWorkbench, generateWorkbench } from "@/data/seed"
import { en } from "@/data/seed-text/en"
import { setLocale } from "@/i18n/runtime"
import type { WorkbenchData } from "@/domain/types"

const TODAY = "2026-09-30"
const NOW = Date.UTC(2026, 8, 30, 12)

function withoutCopy(data: WorkbenchData) {
  return {
    profile: {
      weekdayMin: data.profile.weekdayMin,
      weekendMin: data.profile.weekendMin,
      dayStartHour: data.profile.dayStartHour,
      dayEndHour: data.profile.dayEndHour,
      currency: data.profile.currency,
    },
    projects: data.projects.map((project) => ({
      id: project.id,
      color: project.color,
      stage: project.stage,
      startedOn: project.startedOn,
      monthlyTarget: project.monthlyTarget,
      milestones: project.milestones.map(({ id, due, doneOn }) => ({ id, due, doneOn })),
    })),
    tasks: data.tasks.map((task) => ({
      id: task.id,
      seq: task.seq,
      projectId: task.projectId,
      status: task.status,
      priority: task.priority,
      estimateMin: task.estimateMin,
      plannedFor: task.plannedFor,
      startAt: task.startAt,
      dueOn: task.dueOn,
      subtasks: task.subtasks.map(({ id, done }) => ({ id, done })),
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    })),
    entries: data.entries,
    ledger: data.ledger.map(({ id, kind, date, amount, projectId, category, channel, status, expectedOn, createdAt }) => ({
      id,
      kind,
      date,
      amount,
      projectId,
      category,
      channel,
      status,
      expectedOn,
      createdAt,
    })),
    routines: data.routines.map(({ id, cadence, estimateMin, projectId, doneOn, createdOn, archived }) => ({
      id,
      cadence,
      estimateMin,
      projectId,
      doneOn,
      createdOn,
      archived,
    })),
    notes: data.notes.map(({ week }) => ({ week })),
    timer: data.timer ? { taskId: data.timer.taskId, projectId: data.timer.projectId, startedAt: data.timer.startedAt } : null,
  }
}

function dictionaryTextFields(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (typeof value === "function") {
    const args = Array.from({ length: value.length }, () => "sample")
    return [String(Reflect.apply(value, null, args))]
  }
  if (Array.isArray(value)) return value.flatMap(dictionaryTextFields)
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(dictionaryTextFields)
  return []
}

function textFields(data: WorkbenchData): string[] {
  return [
    data.profile.name,
    ...data.projects.flatMap((project) => [project.name, project.goal, ...project.milestones.map(({ title }) => title)]),
    ...data.tasks.flatMap((task) => [task.title, task.notes, ...task.subtasks.map(({ title }) => title)]),
    ...data.ledger.map(({ note }) => note),
    ...data.routines.map(({ title }) => title),
    ...data.notes.flatMap(({ wins, improve, next }) => [wins, improve, next]),
    ...(data.timer ? [data.timer.label] : []),
  ]
}

afterEach(() => setLocale("zh-CN"))

describe("seed locale", () => {
  it("keeps generated records identical apart from copy", () => {
    setLocale("zh-CN")
    const chinese = generateWorkbench(TODAY, NOW)
    setLocale("en")
    const english = generateWorkbench(TODAY, NOW)

    expect(withoutCopy(english)).toEqual(withoutCopy(chinese))
    expect(english.tasks).toHaveLength(741)
    expect(english.ledger).toHaveLength(158)
  })

  it("contains no Chinese in English copy", () => {
    setLocale("en")
    const english = generateWorkbench(TODAY, NOW)
    const chineseCopy = [...textFields(english), ...dictionaryTextFields(en)].filter((value) => /[\u3400-\u9fff]/u.test(value))

    expect(chineseCopy).toEqual([])
    expect(blankWorkbench().profile.name).toBe("Me")
  })

  it("preserves key Chinese output from the pre-localization seed", () => {
    setLocale("zh-CN")
    const data = generateWorkbench(TODAY, NOW)

    expect(data.projects[0]).toMatchObject({
      id: "p-templates",
      name: "模板商城",
      goal: "把设计好的界面模板做成能直接下载的商品，每月稳定卖出 40 份",
    })
    expect(data.projects[0].milestones[0]).toMatchObject({ id: "M-11", title: "上线第一套模板" })
    expect(data.tasks.find(({ id }) => id === "T-101")).toMatchObject({ id: "T-101", title: "回复商店评论", estimateMin: 60, projectId: "p-plugin" })
    expect(data.tasks.find(({ id }) => id === "T-841")).toMatchObject({ id: "T-841", title: "给新用户发使用指南", estimateMin: 30 })
    expect(data.ledger.find(({ id }) => id === "L-1")).toMatchObject({ id: "L-1", amount: 203, note: "广告联盟月结", date: "2025-10-05" })
    expect(data.ledger.find(({ id }) => id === "L-80")).toMatchObject({ id: "L-80", amount: 730, note: "平台周结算 · 售出 6 份", date: "2026-05-18" })
    expect(data.ledger.find(({ id }) => id === "L-158")).toMatchObject({ id: "L-158", amount: 530, note: "本周销售 · 待平台结算", date: TODAY })
    expect(data.routines.map(({ title }) => title)).toEqual(["晨间写作 30 分钟", "回复用户消息", "运动 40 分钟", "发一篇公众号", "写周回顾", "月度对账"])
    expect(data.notes[0]).toMatchObject({
      wins: "上游超时的问题定位到了网关的连接池",
      improve: "同时开了三件新事，哪件都没收尾",
      next: "进行中的事最多两件",
      week: "2026-09-21",
    })
  })
})
