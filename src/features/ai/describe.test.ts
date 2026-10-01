import { beforeAll, describe, expect, it } from "vitest"

import { formatAmount } from "@/domain/format"
import type { Project, Task } from "@/domain/types"
import { setLocale } from "@/i18n/runtime"
import type { AiChangeset } from "@/sync/protocol"
import { fieldChanges, recordLabel, summarize } from "./describe"

beforeAll(() => {
  setLocale("en")
})

function changeset(changes: AiChangeset["changes"]): Pick<AiChangeset, "changes"> {
  return { changes }
}

describe("summarize", () => {
  it("counts changes by action and record kind in first-seen order", () => {
    expect(
      summarize(
        changeset([
          { seq: 0, kind: "task", action: "create", recordId: "t1", before: null, after: {}, state: "applied" },
          { seq: 1, kind: "ledger", action: "update", recordId: "l1", before: {}, after: {}, state: "applied" },
          { seq: 2, kind: "task", action: "create", recordId: "t2", before: null, after: {}, state: "applied" },
          { seq: 3, kind: "task", action: "delete", recordId: "t3", before: {}, after: null, state: "applied" },
        ])
      )
    ).toEqual([
      { action: "create", kind: "task", count: 2 },
      { action: "update", kind: "ledger", count: 1 },
      { action: "delete", kind: "task", count: 1 },
    ])
  })
})

describe("recordLabel", () => {
  it("uses the record title or name for named records", () => {
    expect(recordLabel("task", { title: "Ship release" })).toEqual({ type: "text", value: "Ship release" })
    expect(recordLabel("routine", { title: "Daily review" })).toEqual({ type: "text", value: "Daily review" })
    expect(recordLabel("project", { name: "Side shop" })).toEqual({ type: "text", value: "Side shop" })
    expect(recordLabel("ledger", { note: "Hosting refund", amount: 12, kind: "income" })).toEqual({ type: "text", value: "Hosting refund" })
  })

  it("returns structured labels for entries without notes and fixed or week records", () => {
    expect(recordLabel("ledger", { amount: 1250, kind: "expense" })).toEqual({ type: "ledger", direction: "expense", amount: 1250 })
    expect(recordLabel("entry", { start: new Date(2026, 9, 1, 9, 15).getTime(), end: new Date(2026, 9, 1, 10, 0).getTime() })).toEqual({
      type: "time",
      date: "Oct 1",
      from: "09:15",
      to: "10:00",
    })
    expect(recordLabel("note", { week: "2026-09-28" })).toEqual({ type: "week", value: "Sep 28 – Oct 4" })
    expect(recordLabel("profile", {})).toEqual({ type: "fixed", value: "profile" })
    expect(recordLabel("timer", {})).toEqual({ type: "fixed", value: "timer" })
  })
})

describe("fieldChanges", () => {
  it("formats task field changes and resolves project names", () => {
    expect(
      fieldChanges(
        "task",
        { title: "Draft", status: "todo", priority: 2, estimateMin: 30, plannedFor: "2026-10-01", startAt: null, dueOn: null, projectId: null, subtasks: [{ title: "A" }] },
        { title: "Ship", status: "doing", priority: 3, estimateMin: 60, plannedFor: "2026-10-02", startAt: "09:30", dueOn: "2026-10-05", projectId: "p1", subtasks: [{ title: "A" }, { title: "B" }] },
        [{ id: "p1", name: "Side shop", color: "blue", stage: "running", goal: "", startedOn: "2026-01-01", monthlyTarget: null, milestones: [] }]
      )
    ).toEqual([
      { field: "title", before: "Draft", after: "Ship" },
      { field: "status", before: "To do", after: "In progress" },
      { field: "priority", before: "Medium", after: "High" },
      { field: "estimate", before: "30 min", after: "1 hr" },
      { field: "plan", before: "Oct 1", after: "Oct 2" },
      { field: "startAt", before: { type: "none" }, after: "09:30" },
      { field: "due", before: { type: "none" }, after: "Oct 5" },
      { field: "project", before: { type: "none" }, after: "Side shop" },
      { field: "subtasks", before: "○ A", after: "○ A, ○ B" },
    ])
  })

  it("describes task note changes", () => {
    expect(
      fieldChanges(
        "task",
        { notes: "Earlier notes" },
        { notes: "Updated notes" }
      )
    ).toEqual([{ field: "notes", before: "Earlier notes", after: "Updated notes" }])
  })

  it("resolves linked tasks and describes project and routine changes", () => {
    const task = {
      id: "t1", seq: 1, title: "Draft", projectId: null, status: "todo", priority: 2, estimateMin: 30,
      plannedFor: null, startAt: null, dueOn: null, notes: "", subtasks: [], createdAt: 0, completedAt: null,
    } satisfies Task
    const project = {
      id: "p1", name: "Side shop", color: "red", stage: "running", goal: "", startedOn: "2026-01-01",
      monthlyTarget: null, milestones: [],
    } satisfies Project

    expect(fieldChanges("entry", { taskId: null, projectId: null }, { taskId: "t1", projectId: "p1" }, [project], [task]))
      .toEqual([
        { field: "task", before: { type: "none" }, after: "Draft" },
        { field: "project", before: { type: "none" }, after: "Side shop" },
      ])
    expect(fieldChanges("project", { color: "red", milestones: [] }, {
      color: "blue", milestones: [{ id: "m1", title: "Launch", due: "2026-10-02", doneOn: null }],
    }))
      .toEqual([
        { field: "color", before: "Red", after: "Blue" },
        { field: "milestones", before: "0", after: "Launch · Oct 2" },
      ])
    expect(fieldChanges("routine", { archived: false }, { archived: true }))
      .toEqual([{ field: "archived", before: "Active", after: "Archived" }])
  })

  it("formats ledger direction, amount, status, date, category, channel, project and note", () => {
    expect(
      fieldChanges(
        "ledger",
        { kind: "income", amount: 1000, status: "pending", date: "2026-10-01", expectedOn: null, category: "sales", channel: "alipay", projectId: "missing", note: "Old note" },
        { kind: "expense", amount: 1250, status: "received", date: "2026-10-02", expectedOn: "2026-10-04", category: "server", channel: "bank", projectId: null, note: "New note" }
      )
    ).toEqual([
      { field: "direction", before: { type: "direction", value: "income" }, after: { type: "direction", value: "expense" } },
      { field: "amount", before: formatAmount(1000), after: formatAmount(1250) },
      { field: "status", before: "Pending", after: "Received" },
      { field: "date", before: "Oct 1", after: "Oct 2" },
      { field: "expected", before: { type: "none" }, after: "Oct 4" },
      { field: "category", before: "Sales", after: "Servers" },
      { field: "channel", before: "Alipay", after: "Bank" },
      { field: "project", before: { type: "deletedProject" }, after: { type: "none" } },
      { field: "note", before: "Old note", after: "New note" },
    ])
  })
})
