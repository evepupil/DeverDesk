import { describe, expect, it } from "vitest"
import { blankWorkbench, generateWorkbench } from "@/data/seed"
import { removeMilestone, updateMilestone } from "@/domain/operations"
import type { Project, Task, TimeEntry, WeekNote, WorkbenchData } from "@/domain/types"
import { SINGLETON_ID } from "@/sync/protocol"
import { applyRecords, diffData, recordKey, type DataChange } from "./records"

const recordCounts = (data: WorkbenchData) => ({
  projects: data.projects.length,
  tasks: data.tasks.length,
  entries: data.entries.length,
  ledger: data.ledger.length,
  routines: data.routines.length,
  notes: data.notes.length,
  singleton: 1 + 1, // profile + timer
})

describe("recordKey", () => {
  it("返回 kind:id 形式的键", () => {
    expect(recordKey("task", "T-101")).toBe("task:T-101")
    expect(recordKey("note", "2026-09-28")).toBe("note:2026-09-28")
    expect(recordKey("profile", SINGLETON_ID)).toBe("profile:singleton")
    expect(recordKey("timer", SINGLETON_ID)).toBe("timer:singleton")
  })
})

describe("diffData", () => {
  it("改名或删掉副业里的一条里程碑，整个副业作为一条改动发出去，对面收到后里程碑和这边一致", () => {
    const before = generateWorkbench("2026-09-30", 1000)
    const project = before.projects.find((item) => item.milestones.length >= 2) as Project
    const [first, second] = project.milestones
    const withProject = (next: Project): WorkbenchData => ({
      ...before,
      projects: before.projects.map((item) => (item.id === next.id ? next : item)),
    })
    const milestonesAfter = (data: WorkbenchData) => data.projects.find((item) => item.id === project.id)?.milestones

    const renamed = updateMilestone(project, first.id, { title: "改过的名字" })
    const renameChanges = diffData(before, withProject(renamed))
    expect(renameChanges).toEqual([{ kind: "project", id: project.id, data: renamed }])
    expect(milestonesAfter(applyRecords(before, renameChanges))).toEqual(renamed.milestones)

    const removed = removeMilestone(project, second.id)
    const removeChanges = diffData(before, withProject(removed))
    expect(removeChanges).toEqual([{ kind: "project", id: project.id, data: removed }])
    const received = milestonesAfter(applyRecords(before, removeChanges))
    expect(received).toEqual(removed.milestones)
    expect(received?.some((milestone) => milestone.id === second.id)).toBe(false)
  })

  it("两个相同引用的数据之间没有改动", () => {
    const data = generateWorkbench("2026-09-30", 1000)
    expect(diffData(data, data)).toEqual([])
  })

  it("列表数组引用没变时，这个列表不产生改动（即使内容不同）", () => {
    const before = generateWorkbench("2026-09-30", 1000)
    const after: WorkbenchData = { ...before, tasks: before.tasks } // 引用相同
    // 换掉 profile 触发一次改动，确认只有 profile 一条
    after.profile = { ...before.profile, name: "另一个人" }
    const changes = diffData(before, after)
    expect(changes).toEqual([
      { kind: "profile", id: SINGLETON_ID, data: after.profile },
    ])
  })

  it("新增记录和引用变化的记录都算改动，data 是新对象", () => {
    const before = generateWorkbench("2026-09-30", 1000)
    const newTask: Task = { ...before.tasks[0], id: "T-new", title: "新任务" }
    const changedProject: Project = { ...before.projects[0], name: "改名了" }
    const after: WorkbenchData = {
      ...before,
      tasks: [newTask, ...before.tasks],
      projects: [changedProject, ...before.projects.slice(1)],
    }
    const changes = diffData(before, after)
    const taskChanges = changes.filter((change) => change.kind === "task")
    const projectChanges = changes.filter((change) => change.kind === "project")
    expect(taskChanges).toEqual([{ kind: "task", id: "T-new", data: newTask }])
    expect(projectChanges).toEqual([{ kind: "project", id: "p-templates", data: changedProject }])
    expect(taskChanges[0].data).toBe(newTask)
    expect(projectChanges[0].data).toBe(changedProject)
  })

  it("消失的记录算删除，data 为 null", () => {
    const before = generateWorkbench("2026-09-30", 1000)
    const removedTask = before.tasks[0]
    const removedEntry = before.entries[0]
    const after: WorkbenchData = {
      ...before,
      tasks: before.tasks.slice(1),
      entries: before.entries.slice(1),
    }
    const changes = diffData(before, after)
    expect(changes).toContainEqual({ kind: "task", id: removedTask.id, data: null })
    expect(changes).toContainEqual({ kind: "entry", id: removedEntry.id, data: null })
    expect(changes.filter((change) => change.kind === "task")).toHaveLength(1)
    expect(changes.filter((change) => change.kind === "entry")).toHaveLength(1)
  })

  it("周回顾按 week 识别，不是按对象引用之外的字段", () => {
    const before = generateWorkbench("2026-09-30", 1000)
    const sameWeekNewObject: WeekNote = { ...before.notes[0], wins: "这周换了内容" }
    const removedWeek = before.notes[1].week
    const addedWeek: WeekNote = { week: "2020-01-06", wins: "早", improve: "起得来", next: "保持" }
    const after: WorkbenchData = {
      ...before,
      notes: [addedWeek, sameWeekNewObject, ...before.notes.slice(2)],
    }
    const changes = diffData(before, after)
    const noteChanges = changes.filter((change) => change.kind === "note")
    // 实现先扫新列表再扫旧列表：新增/修改按 next 顺序在前，删除在后
    expect(noteChanges).toEqual([
      { kind: "note", id: addedWeek.week, data: addedWeek },
      { kind: "note", id: sameWeekNewObject.week, data: sameWeekNewObject },
      { kind: "note", id: removedWeek, data: null },
    ])
  })

  it("profile 按引用比较：内容相同但引用不同也算改动", () => {
    const before = generateWorkbench("2026-09-30", 1000)
    const after: WorkbenchData = { ...before, profile: { ...before.profile } }
    expect(diffData(before, after)).toEqual([
      { kind: "profile", id: SINGLETON_ID, data: after.profile },
    ])
  })

  it("timer 从有到 null 时 data 为 null，从 null 到有时 data 是计时器对象", () => {
    const before = generateWorkbench("2026-09-30", 1000)
    const timing: WorkbenchData["timer"] = { taskId: "T-101", projectId: "p-relay", label: "排查接口", startedAt: 2000 }
    const started: WorkbenchData = { ...before, timer: timing }
    expect(diffData(before, started)).toEqual([{ kind: "timer", id: SINGLETON_ID, data: timing }])

    const stopped: WorkbenchData = { ...started, timer: null }
    expect(diffData(started, stopped)).toEqual([{ kind: "timer", id: SINGLETON_ID, data: null }])
  })
})

describe("applyRecords", () => {
  const base = (): WorkbenchData => ({
    profile: { name: "我", weekdayMin: 180, weekendMin: 360, dayStartHour: 8, dayEndHour: 24 },
    projects: [{ id: "p1", name: "博客", color: "blue", stage: "running", goal: "", startedOn: "2026-01-05", monthlyTarget: null, milestones: [] }],
    tasks: [{ id: "t1", seq: 1, title: "旧任务", projectId: "p1", status: "todo", priority: 0, estimateMin: 30, plannedFor: null, startAt: null, dueOn: null, notes: "", subtasks: [], createdAt: 1, completedAt: null }],
    entries: [{ id: "e1", taskId: null, projectId: "p1", start: 1000, end: 2000 }],
    ledger: [],
    routines: [],
    notes: [{ week: "2026-09-28", wins: "w", improve: "i", next: "n" }],
    timer: null,
  })

  it("preserves directory and recorder fields when applying synchronized records", () => {
    const data = base()
    const project = { ...data.projects[0], dirNames: ["source-folder"] }
    const task = { ...data.tasks[0], origin: "coding" as const }
    const entry = { ...data.entries[0], minutes: 17, origin: "coding" as const }
    const result = applyRecords(data, [
      { kind: "project", id: project.id, data: project },
      { kind: "task", id: task.id, data: task },
      { kind: "entry", id: entry.id, data: entry },
    ])

    expect(result.projects[0].dirNames).toEqual(["source-folder"])
    expect(result.tasks[0].origin).toBe("coding")
    expect(result.entries[0]).toMatchObject({ minutes: 17, origin: "coding" })
  })

  it("已有的记录原位替换、新的追加，顺序保持", () => {
    const data = base()
    const replacedTask: Task = { ...data.tasks[0], title: "改过的任务" }
    const appendedTask: Task = { ...data.tasks[0], id: "t2", seq: 2, title: "追加的任务" }
    const result = applyRecords(data, [
      { kind: "task", id: "t2", data: appendedTask },
      { kind: "task", id: "t1", data: replacedTask },
    ])
    expect(result.tasks.map((task) => task.id)).toEqual(["t1", "t2"])
    expect(result.tasks[0]).toBe(replacedTask)
    expect(result.tasks[1]).toBe(appendedTask)
  })

  it("data 为 null 的记录被删除", () => {
    const data = base()
    const result = applyRecords(data, [
      { kind: "entry", id: "e1", data: null },
      { kind: "note", id: "2026-09-28", data: null },
    ])
    expect(result.entries).toEqual([])
    expect(result.notes).toEqual([])
  })

  it("没动到的列表保持原数组引用，没动到的记录保持原对象引用", () => {
    const data = base()
    const appendedEntry: TimeEntry = { id: "e2", taskId: "t1", projectId: null, start: 3000, end: 4000 }
    const result = applyRecords(data, [{ kind: "entry", id: "e2", data: appendedEntry }])
    expect(result.projects).toBe(data.projects)
    expect(result.tasks).toBe(data.tasks)
    expect(result.ledger).toBe(data.ledger)
    expect(result.routines).toBe(data.routines)
    expect(result.notes).toBe(data.notes)
    expect(result.profile).toBe(data.profile)
    expect(result.timer).toBe(data.timer)
    expect(result.entries).not.toBe(data.entries)
    expect(result.entries[0]).toBe(data.entries[0])
    expect(result.entries[1]).toBe(appendedEntry)
  })

  it("重复应用同一条只算一次（幂等）", () => {
    const data = base()
    const changedTask: Task = { ...data.tasks[0], title: "第二次改" }
    const changes: DataChange[] = [{ kind: "task", id: "t1", data: changedTask }]
    const once = applyRecords(data, changes)
    const twice = applyRecords(once, changes)
    expect(twice.tasks).toEqual(once.tasks)
    expect(twice.tasks[0]).toBe(once.tasks[0])
  })

  it("profile 的 data 为 null 时忽略，保留原 profile", () => {
    const data = base()
    const result = applyRecords(data, [{ kind: "profile", id: SINGLETON_ID, data: null }])
    expect(result.profile).toBe(data.profile)
  })

  it("timer 的 data 为 null 时变成 null，有值时替换", () => {
    const data = base()
    const cleared = applyRecords(data, [{ kind: "timer", id: SINGLETON_ID, data: null }])
    expect(cleared.timer).toBeNull()

    const timing = { taskId: "t1", projectId: null, label: "专注中", startedAt: 5000 }
    const started = applyRecords(cleared, [{ kind: "timer", id: SINGLETON_ID, data: timing }])
    expect(started.timer).toBe(timing)
  })
})

describe("diffData 与 applyRecords 往返", () => {
  it("任意改动集：diffData(a, applyRecords(a, recs)) 恰好等于 recs（同一条只算一次）", () => {
    const before = generateWorkbench("2026-09-30", 1000)
    const changedTask: Task = { ...before.tasks[0], title: "往返改标题" }
    const newTask: Task = { ...before.tasks[0], id: "T-roundtrip", seq: 99_999, title: "往返新增" }
    const removedProjectId = before.projects[before.projects.length - 1].id
    const changedNote: WeekNote = { ...before.notes[0], improve: "往返改回顾" }
    const timer = { taskId: null, projectId: "p-blog", label: "写作", startedAt: 3000 }

    const recs: DataChange[] = [
      { kind: "task", id: changedTask.id, data: changedTask },
      { kind: "task", id: newTask.id, data: newTask },
      { kind: "project", id: removedProjectId, data: null },
      { kind: "note", id: changedNote.week, data: changedNote },
      { kind: "timer", id: SINGLETON_ID, data: timer },
    ]

    const after = applyRecords(before, recs)
    // 任务书只约定「恰好给出这组改动、同一条只算一次」，顺序没有约定，按记录键比较
    const byKey = (changes: DataChange[]) => [...changes].sort((a, b) => recordKey(a.kind, a.id).localeCompare(recordKey(b.kind, b.id)))
    expect(byKey(diffData(before, after))).toEqual(byKey(recs))
  })

  it("generateWorkbench 与 blankWorkbench 互相 diff：删除全部 + 新增全部", () => {
    const full = generateWorkbench("2026-09-30", 1000)
    const blank = blankWorkbench()

    const blankToFull = diffData(blank, full)
    const counts = recordCounts(full)
    const listCounts = counts.projects + counts.tasks + counts.entries + counts.ledger + counts.routines + counts.notes
    // 空白没有可删的记录；timer 两边都是 null 不产生改动，profile 有一条改动
    expect(blankToFull).toHaveLength(listCounts + 1)
    expect(blankToFull.filter((change) => change.kind !== "profile")).toHaveLength(listCounts)
    expect(blankToFull.filter((change) => change.data === null)).toHaveLength(0)

    const fullToBlank = diffData(full, blank)
    // 删除全部列表记录 + profile 改成空白那份；timer 从 null 到 null 没有改动
    const expectedDown = counts.projects + counts.tasks + counts.entries + counts.ledger + counts.routines + counts.notes + 1
    expect(fullToBlank).toHaveLength(expectedDown)
    expect(fullToBlank.filter((change) => change.kind !== "profile").every((change) => change.data === null)).toBe(true)
    expect(fullToBlank).toContainEqual({ kind: "profile", id: SINGLETON_ID, data: blank.profile })

    // 全部新增应用后，再 diff 为空
    const rebuilt = applyRecords(blank, blankToFull)
    expect(diffData(full, rebuilt)).toEqual([])
  })
})
