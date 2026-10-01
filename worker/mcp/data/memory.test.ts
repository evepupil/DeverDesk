import { describe, expect, it, vi } from "vitest"
import type { WorkbenchData } from "../../../src/domain/types"
import { createMemoryDataSource } from "./memory"

function emptyData(): WorkbenchData {
  return {
    profile: { name: "", weekdayMin: 180, weekendMin: 360, dayStartHour: 8, dayEndHour: 24 },
    projects: [],
    tasks: [],
    entries: [],
    ledger: [],
    routines: [],
    notes: [],
    timer: null,
  }
}

describe("createMemoryDataSource", () => {
  it("assigns default metadata in workbench order and keeps each revision unique", async () => {
    const data = emptyData()
    data.projects.push({
      id: "project-1", name: "Project", color: "blue", stage: "idea", goal: "", startedOn: "2026-01-01", monthlyTarget: null, milestones: [],
    })
    data.tasks.push({
      id: "task-1", seq: 1, title: "Task", projectId: null, status: "todo", priority: 1, estimateMin: 30,
      plannedFor: null, startAt: null, dueOn: null, notes: "", subtasks: [], createdAt: 1, completedAt: null,
    })
    data.entries.push({ id: "entry-1", taskId: null, projectId: null, start: 1, end: 60_001 })
    data.ledger.push({
      id: "ledger-1", kind: "income", amount: 1, projectId: null, category: "other-income", channel: "bank",
      status: "received", date: "2026-01-01", expectedOn: null, note: "", createdAt: 1,
    })
    data.routines.push({
      id: "routine-1", title: "Routine", cadence: "daily", estimateMin: 10, projectId: null, doneOn: [], createdOn: "2026-01-01", archived: false,
    })
    data.notes.push({ week: "2026-01-05", wins: "", improve: "", next: "" })
    data.timer = { taskId: null, projectId: null, label: "Timer", startedAt: 1 }

    const source = createMemoryDataSource(data)
    const all = [
      ...(await source.projects()),
      ...(await source.tasks({})),
      ...(await source.entries({})),
      ...(await source.ledger({})),
      ...(await source.routines()),
      ...(await source.notes()),
    ]
    expect(all.map((record) => record.rev)).toEqual([1, 2, 3, 4, 5, 6])
    expect(all.every((record) => record.updatedAt === 1)).toBe(true)
    expect(await source.profile()).toEqual({ value: data.profile, updatedAt: 1, rev: 7 })
    expect(await source.timer()).toEqual({ value: data.timer, updatedAt: 1, rev: 8 })
    expect((await source.record("profile", "singleton"))?.rev).toBe(7)
    expect((await source.record("timer", "singleton"))?.rev).toBe(8)
  })

  it("aggregates task counts and rounded entry minutes with domain semantics", async () => {
    const data = emptyData()
    data.tasks = [
      {
        id: "task-1", seq: 1, title: "First", projectId: "p-a", status: "todo", priority: 1, estimateMin: 30,
        plannedFor: null, startAt: null, dueOn: null, notes: "", subtasks: [], createdAt: 1, completedAt: null,
      },
      {
        id: "task-2", seq: 2, title: "Second", projectId: null, status: "doing", priority: 1, estimateMin: 30,
        plannedFor: null, startAt: null, dueOn: null, notes: "", subtasks: [], createdAt: 1, completedAt: null,
      },
      {
        id: "task-3", seq: 3, title: "Third", projectId: "p-a", status: "doing", priority: 1, estimateMin: 30,
        plannedFor: null, startAt: null, dueOn: null, notes: "", subtasks: [], createdAt: 1, completedAt: null,
      },
    ]
    data.entries = [
      { id: "e-zero", taskId: "task-1", projectId: "p-a", start: 0, end: 29_999 },
      { id: "e-half", taskId: "task-1", projectId: "p-a", start: 0, end: 30_000 },
      { id: "e-round-up", taskId: "task-1", projectId: "p-a", start: 0, end: 90_000 },
      { id: "e-negative", taskId: "task-1", projectId: "p-a", start: 30_000, end: 0 },
      { id: "e-other", taskId: "task-2", projectId: null, start: 0, end: 30_000 },
      { id: "e-unlinked", taskId: null, projectId: null, start: 0, end: 120_000 },
    ]
    const source = createMemoryDataSource(data)

    expect(await source.countTasksByProject!({ statuses: ["todo", "doing"], limit: 2 })).toEqual(new Map([
      ["p-a", 1], [null, 1],
    ]))
    expect(await source.sumEntryMinutesByTask!(["task-1", "task-1", "task-2", "missing"])).toEqual(new Map([
      ["task-1", 3], ["task-2", 1],
    ]))
    expect(await source.sumEntryMinutesByTask!([])).toEqual(new Map())
  })

  it("uses tombstones for record lookups and distinguishes a never-created timer", async () => {
    const data = emptyData()
    data.tasks.push({
      id: "task-deleted", seq: 9, title: "Gone", projectId: null, status: "todo", priority: 0, estimateMin: 0,
      plannedFor: null, startAt: null, dueOn: null, notes: "", subtasks: [], createdAt: 1, completedAt: null,
    })
    const source = createMemoryDataSource(data, {
      deleted: [
        { kind: "task", id: "task-deleted", updatedAt: 80, rev: 20 },
        { kind: "timer", id: "singleton", updatedAt: 90, rev: 21 },
      ],
    })

    expect(await source.tasks({})).toEqual([])
    expect(await source.record("task", "task-deleted")).toEqual({
      value: null, updatedAt: 80, rev: 20, deleted: true,
    })
    expect(await source.timer()).toEqual({ value: null, updatedAt: 90, rev: 21 })
    expect(await createMemoryDataSource(emptyData()).timer()).toEqual({ value: null, updatedAt: null, rev: null })
    expect(await source.record("task", "never-seen")).toBeNull()
  })

  it("reserves explicit revisions before assigning missing ones", async () => {
    const data = emptyData()
    data.projects = [
      { id: "p1", name: "one", color: "blue", stage: "idea", goal: "", startedOn: "2026-01-01", monthlyTarget: null, milestones: [] },
      { id: "p2", name: "two", color: "green", stage: "idea", goal: "", startedOn: "2026-01-01", monthlyTarget: null, milestones: [] },
    ]
    const source = createMemoryDataSource(data, { versions: { "project:p2": { updatedAt: 30, rev: 1 } } })
    const records = await source.projects()
    expect(records.map((record) => record.rev).sort((a, b) => a - b)).toEqual([1, 2])
    expect(records.find((record) => record.value.id === "p2")).toMatchObject({ updatedAt: 30, rev: 1 })
  })

  it("skips malformed rows in memory and preserves invalid record versions", async () => {
    const malformed = {
      profile: { name: "Broken" },
      projects: [{ id: "bad-project", name: "Bad", color: "blue", stage: "idea", goal: "", startedOn: "2026-01-01", monthlyTarget: null }],
      tasks: [{ id: "bad-task", seq: 1, title: "Bad", projectId: null, status: "todo", priority: 0, estimateMin: 0, plannedFor: null, startAt: null, dueOn: null, notes: "", createdAt: 1, completedAt: null }],
      entries: [{ id: "bad-entry", taskId: null, projectId: null, start: 1 }],
      ledger: [{ id: "bad-ledger" }],
      routines: [{ id: "bad-routine", title: "Bad", cadence: "daily", estimateMin: 10, projectId: null, createdOn: "2026-01-01", archived: false }],
      notes: [{ week: "2026-01-05", wins: "", improve: "" }],
      timer: { taskId: null, projectId: null, label: "Bad" },
    } as unknown as WorkbenchData
    const versions = {
      "task:bad-task": { updatedAt: 302, rev: 2 },
      "profile:singleton": { updatedAt: 307, rev: 7 },
      "timer:singleton": { updatedAt: 308, rev: 8 },
    }
    const source = createMemoryDataSource(malformed, { versions })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      expect(await source.projects()).toEqual([])
      expect(await source.tasks({})).toEqual([])
      expect(await source.entries({})).toEqual([])
      expect(await source.ledger({})).toEqual([])
      expect(await source.routines()).toEqual([])
      expect(await source.notes()).toEqual([])
      expect(await source.profile()).toEqual({ value: null, updatedAt: 307, rev: 7 })
      expect(await source.timer()).toEqual({ value: null, updatedAt: 308, rev: 8 })
      expect(warn).toHaveBeenCalledTimes(8)
      expect(await source.record("task", "bad-task")).toEqual({
        value: null, updatedAt: 302, rev: 2, deleted: false,
      })
      expect(warn).toHaveBeenCalledTimes(9)
    } finally {
      warn.mockRestore()
    }
  })
})

