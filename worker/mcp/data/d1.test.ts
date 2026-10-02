import { beforeAll, describe, expect, it, vi } from "vitest"
import type { DayKey, LedgerEntry, Project, Task, TimeEntry, WorkbenchData } from "../../../src/domain/types"
import type { RecordKind } from "../../../src/sync/protocol"
import { createD1DataSource } from "./d1"
import { createMemoryDataSource, type MemoryDataSourceOptions } from "./memory"
import { createTestD1 } from "../../testing/d1-sqlite.mjs"
import type { TestD1Database } from "../../testing/d1-sqlite.d.mts"
import type { EntryQuery, LedgerQuery, TaskQuery } from "../types"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

const at = (value: string) => Date.parse(`${value}Z`)

function makeTask(id: string, seq: number, overrides: Partial<Task> = {}): Task {
  return {
    id, seq, title: `Task ${seq}`, projectId: null, status: "todo", priority: 1, estimateMin: 30,
    plannedFor: null, startAt: null, dueOn: null, notes: "", subtasks: [], createdAt: at("2026-09-30T10:00:00"),
    completedAt: null, ...overrides,
  }
}

function makeProject(id: string, name: string): Project {
  return { id, name, color: "blue", stage: "running", goal: "", startedOn: "2026-01-01", monthlyTarget: null, milestones: [] }
}

function makeEntry(id: string, start: string, taskId: string | null, projectId: string | null): TimeEntry {
  const startMs = at(start)
  return { id, taskId, projectId, start: startMs, end: startMs + 60_000 }
}

function makeLedger(overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "id" | "date" | "createdAt">): LedgerEntry {
  return {
    kind: "income", amount: 50, projectId: null, category: "other-income", channel: "bank", status: "received",
    expectedOn: null, note: "", ...overrides,
  }
}

function fixture(): { data: WorkbenchData; versions: Record<string, { updatedAt: number; rev: number }> } {
  const data: WorkbenchData = {
    profile: { name: "Tester", weekdayMin: 180, weekendMin: 360, dayStartHour: 8, dayEndHour: 24, timeZone: "UTC" },
    projects: [makeProject("p-b", "Beta"), makeProject("p-a", "Alpha")],
    tasks: [
      makeTask("task-20", 20, { title: `Alpha %_ task ${"界".repeat(80)}`, projectId: "p-a", plannedFor: "2026-10-02", dueOn: "2026-10-04" }),
      makeTask("task-03", 3, { title: "Beta task", status: "done", dueOn: "2026-10-02", completedAt: at("2026-10-01T10:00:00") }),
      makeTask("task-07", 7, { title: "Work task", status: "doing", projectId: "p-b", plannedFor: "2026-10-01" }),
      makeTask("task-Aa", 30),
      makeTask("task-aA", 30),
    ],
    entries: [
      makeEntry("entry-late", "2026-10-01T12:00:00", "task-07", "p-b"),
      makeEntry("entry-early", "2026-10-01T09:00:00", null, null),
      makeEntry("entry-next", "2026-10-02T10:00:00", "task-20", "p-a"),
    ],
    ledger: [
      makeLedger({ id: "ledger-late", date: "2026-10-02", createdAt: at("2026-10-02T15:00:00"), kind: "expense", status: "pending", note: "Alpha %_ expense", externalId: "ext-2" }),
      makeLedger({ id: "ledger-early", date: "2026-10-01", createdAt: at("2026-10-01T20:00:00"), projectId: "p-a", note: "Alpha income", externalId: "ext-1" }),
      makeLedger({ id: "ledger-same-day", date: "2026-10-01", createdAt: at("2026-10-01T10:00:00"), kind: "expense", projectId: "p-a", category: "tools", note: "Monthly tools" }),
    ],
    routines: [
      { id: "routine-b", title: "Later", cadence: "weekly", estimateMin: 30, projectId: null, doneOn: [], createdOn: "2026-01-01", archived: false },
      { id: "routine-a", title: "Earlier", cadence: "daily", estimateMin: 10, projectId: "p-a", doneOn: [], createdOn: "2026-01-01", archived: false },
    ],
    notes: [
      { week: "2026-09-28", wins: "week two", improve: "", next: "" },
      { week: "2026-09-21", wins: "week one", improve: "", next: "" },
    ],
    timer: null,
  }
  const versions = {
    "project:p-b": { updatedAt: 103, rev: 3 },
    "project:p-a": { updatedAt: 101, rev: 1 },
    "task:task-20": { updatedAt: 110, rev: 10 },
    "task:task-03": { updatedAt: 111, rev: 11 },
    "task:task-07": { updatedAt: 112, rev: 12 },
    "task:task-Aa": { updatedAt: 113, rev: 13 },
    "task:task-aA": { updatedAt: 114, rev: 14 },
    "entry:entry-late": { updatedAt: 120, rev: 20 },
    "entry:entry-early": { updatedAt: 121, rev: 21 },
    "entry:entry-next": { updatedAt: 122, rev: 22 },
    "ledger:ledger-late": { updatedAt: 130, rev: 30 },
    "ledger:ledger-early": { updatedAt: 131, rev: 31 },
    "ledger:ledger-same-day": { updatedAt: 132, rev: 32 },
    "routine:routine-b": { updatedAt: 140, rev: 40 },
    "routine:routine-a": { updatedAt: 141, rev: 41 },
    "note:2026-09-28": { updatedAt: 150, rev: 50 },
    "note:2026-09-21": { updatedAt: 151, rev: 51 },
    "profile:singleton": { updatedAt: 160, rev: 60 },
    "timer:singleton": { updatedAt: 180, rev: 80 },
  }
  return { data, versions }
}

async function seedD1(
  db: TestD1Database,
  data: WorkbenchData,
  versions: Record<string, { updatedAt: number; rev: number }>,
): Promise<void> {
  const liveRows: { kind: RecordKind; id: string; value: unknown }[] = [
    ...data.projects.map((value) => ({ kind: "project" as const, id: value.id, value })),
    ...data.tasks.map((value) => ({ kind: "task" as const, id: value.id, value })),
    ...data.entries.map((value) => ({ kind: "entry" as const, id: value.id, value })),
    ...data.ledger.map((value) => ({ kind: "ledger" as const, id: value.id, value })),
    ...data.routines.map((value) => ({ kind: "routine" as const, id: value.id, value })),
    ...data.notes.map((value) => ({ kind: "note" as const, id: value.week, value })),
    { kind: "profile", id: "singleton", value: data.profile },
  ]
  for (const row of liveRows.reverse()) {
    const version = versions[`${row.kind}:${row.id}`]
    await db.prepare(
      "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, ?, ?, 0, 'app')"
    ).bind(row.kind, row.id, JSON.stringify(row.value), version.updatedAt, version.rev).run()
  }
  await db.prepare(
    "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, ?, ?, 0, 'app')"
  ).bind("project", "project-bad", "{not json", 170, 70).run()

  const deletedRows = [
    { kind: "task", id: "task-deleted", value: makeTask("task-deleted", 99), updatedAt: 171, rev: 71 },
    { kind: "entry", id: "entry-deleted", value: makeEntry("entry-deleted", "2026-10-01T08:00:00", null, null), updatedAt: 172, rev: 72 },
    { kind: "ledger", id: "ledger-deleted", value: makeLedger({ id: "ledger-deleted", date: "2026-10-01", createdAt: 1 }), updatedAt: 173, rev: 73 },
  ]
  for (const row of deletedRows) {
    await db.prepare(
      "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, ?, ?, 1, 'app')"
    ).bind(row.kind, row.id, JSON.stringify(row.value), row.updatedAt, row.rev).run()
  }
  await db.prepare(
    "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES ('timer', 'singleton', NULL, 180, 80, 1, 'app')"
  ).run()
}

describe("createD1DataSource", () => {
  it("matches the memory source for every query condition and keeps tombstones addressable", async () => {
    const db = createTestD1()
    const { data, versions } = fixture()
    await seedD1(db, data, versions)
    const deleted = [
      { kind: "task", id: "task-deleted", updatedAt: 171, rev: 71 },
      { kind: "entry", id: "entry-deleted", updatedAt: 172, rev: 72 },
      { kind: "ledger", id: "ledger-deleted", updatedAt: 173, rev: 73 },
      { kind: "timer", id: "singleton", updatedAt: 180, rev: 80 },
    ]
    const memoryOptions: MemoryDataSourceOptions = { versions, deleted }
    const memory = createMemoryDataSource(data, memoryOptions)
    const d1 = createD1DataSource(db)

    const taskQueries: TaskQuery[] = [
      {},
      { ids: ["task-20", "task-03"] },
      { ids: [] },
      { seqs: [3, 20] },
      { seqs: [] },
      { statuses: ["todo", "doing"] },
      { statuses: [] },
      { plannedFrom: "2026-10-01", plannedTo: "2026-10-02" },
      { unplanned: true },
      { dueTo: "2026-10-02" },
      { dueFrom: "2026-10-03", dueTo: "2026-10-04" },
      { dueFrom: "2026-10-03", dueTo: "2026-10-04", orderBy: "due", limit: 1 },
      { statuses: ["todo", "doing"], orderBy: "priority", limit: 2 },
      { completedFrom: at("2026-10-01T10:00:00"), completedTo: at("2026-10-01T11:00:00") },
      { projectId: null },
      { projectId: "p-a" },
      { text: "aLpHa" },
      { text: "%_" },
      { text: "界".repeat(80) },
      { limit: 2 },
      { statuses: ["doing", "todo"], plannedFrom: "2026-10-01", projectId: null, limit: 1 },
      { ids: Array.from({ length: 120 }, (_, index) => `missing-${index}`) },
    ]
    for (const query of taskQueries) expect(await d1.tasks(query)).toEqual(await memory.tasks(query))
    expect((await memory.tasks({ seqs: [30] })).map((record) => record.value.id)).toEqual(["task-Aa", "task-aA"])
    expect((await d1.tasks({ text: "界".repeat(80) })).map((record) => record.value.id)).toEqual(["task-20"])

    const entryQueries: EntryQuery[] = [
      {},
      { ids: ["entry-next", "entry-early"] },
      { ids: [] },
      { from: at("2026-10-01T09:00:00"), to: at("2026-10-02T10:00:00") },
      { projectId: null },
      { projectId: "p-a" },
      { taskIds: ["task-20", "task-07"] },
      { taskIds: [] },
      { limit: 2 },
      { from: at("2026-10-01T09:00:00"), projectId: null, taskIds: ["task-20"] },
      { ids: Array.from({ length: 120 }, (_, index) => `missing-${index}`) },
    ]
    for (const query of entryQueries) expect(await d1.entries(query)).toEqual(await memory.entries(query))

    const ledgerQueries: LedgerQuery[] = [
      {},
      { ids: ["ledger-late", "ledger-early"] },
      { ids: [] },
      { from: "2026-10-01", to: "2026-10-01" },
      { statuses: ["pending"] },
      { statuses: [] },
      { kinds: ["expense"] },
      { kinds: [] },
      { projectId: null },
      { projectId: "p-a" },
      { externalIds: ["ext-1", "ext-2"] },
      { externalIds: [] },
      { text: "aLpHa" },
      { text: "%_" },
      { limit: 2 },
      { statuses: ["received", "pending"], kinds: ["expense"], projectId: "p-a", to: "2026-10-02" },
      { ids: Array.from({ length: 120 }, (_, index) => `missing-${index}`) },
    ]
    for (const query of ledgerQueries) expect(await d1.ledger(query)).toEqual(await memory.ledger(query))

    expect(await d1.projects()).toEqual(await memory.projects())
    expect(await d1.routines()).toEqual(await memory.routines())
    expect(await d1.notes()).toEqual(await memory.notes())
    for (const weeks of [undefined, ["2026-09-28"] as DayKey[], []]) {
      expect(await d1.notes(weeks)).toEqual(await memory.notes(weeks))
    }
    expect(await d1.profile()).toEqual(await memory.profile())
    expect(await d1.timer()).toEqual(await memory.timer())

    for (const [kind, id] of [
      ["task", "task-20"],
      ["task", "task-deleted"],
      ["entry", "entry-deleted"],
      ["ledger", "ledger-deleted"],
      ["timer", "singleton"],
    ] as const) {
      expect(await d1.record(kind, id)).toEqual(await memory.record(kind, id))
    }
    expect(await d1.record("task", "never-seen")).toBeNull()
    expect(await d1.tasks({ ids: ["task-deleted"] })).toEqual([])
    expect(await d1.entries({ ids: ["entry-deleted"] })).toEqual([])
    expect(await d1.ledger({ ids: ["ledger-deleted"] })).toEqual([])
  })

  it("matches memory for aggregated task counts and rounded task minutes", async () => {
    const db = createTestD1()
    const { data, versions } = fixture()
    const codingTask = makeTask("task-coding", 31, { origin: "coding" })
    data.tasks.push(codingTask)
    versions["task:task-coding"] = { updatedAt: 250, rev: 250 }
    const addEntry = (id: string, taskId: string | null, start: number, end: number): TimeEntry => ({
      id, taskId, projectId: null, start, end,
    })
    const aggregateEntries = [
      addEntry("entry-zero", "task-20", 0, 29_999),
      addEntry("entry-half", "task-20", 0, 30_000),
      addEntry("entry-round-up", "task-20", 0, 90_000),
      addEntry("entry-negative", "task-20", 30_000, 0),
      addEntry("entry-other-half", "task-07", 0, 30_000),
      { ...addEntry("entry-override", "task-20", 0, 600_000), minutes: 8.6, origin: "coding" as const },
      { ...addEntry("entry-zero-minutes", "task-20", 0, 60_000), minutes: 0 },
      { ...addEntry("entry-negative-minutes", "task-20", 60_000, 0), minutes: -3 },
    ]
    data.entries.push(...aggregateEntries)
    aggregateEntries.forEach((entry, index) => {
      versions[`entry:${entry.id}`] = { updatedAt: 200 + index, rev: 200 + index }
    })
    await seedD1(db, data, versions)
    const insert = db.prepare(
      "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, 1, ?, ?, 'app')"
    )
    await insert.bind("task", "task-bad-shape", JSON.stringify({ id: "bad", seq: 900, status: "todo", projectId: "p-a" }), 901, 0).run()
    await insert.bind("entry", "entry-bad-shape", JSON.stringify({ id: "bad", taskId: "task-20", start: 0, end: 60_000 }), 902, 0).run()
    await insert.bind("entry", "entry-bad-minutes", JSON.stringify({ ...addEntry("bad", "task-20", 0, 60_000), minutes: null }), 904, 0).run()
    await insert.bind("entry", "entry-deleted-aggregate", JSON.stringify(addEntry("entry-deleted-aggregate", "task-20", 0, 600_000)), 903, 1).run()

    const memory = createMemoryDataSource(data, { versions })
    const d1 = createD1DataSource(db)
    const taskQueries: TaskQuery[] = [
      { statuses: ["todo", "doing"] },
      { statuses: ["todo", "doing"], limit: 2 },
      { projectId: null },
      { statuses: [] },
    ]
    for (const query of taskQueries) {
      expect(await d1.countTasksByProject!(query)).toEqual(await memory.countTasksByProject!(query))
    }
    expect(await d1.countTasksByProject!({ statuses: ["todo", "doing"] })).toEqual(new Map([
      ["p-a", 1], ["p-b", 1], [null, 3],
    ]))
    expect(await d1.sumEntryMinutesByTask!(["task-20", "task-20", "task-07", "missing"])).toEqual(
      await memory.sumEntryMinutesByTask!(["task-20", "task-20", "task-07", "missing"]),
    )
    expect(await d1.sumEntryMinutesByTask!(["task-20", "task-07"])).toEqual(new Map([
      ["task-20", 13], ["task-07", 2],
    ]))
    expect(await d1.sumEntryMinutesByTask!([])).toEqual(new Map())

    for (let index = 0; index < 3; index += 1) {
      const durationEntry = {
        id: `entry-clamped-duration-${index}`, taskId: "task-huge", projectId: null,
        start: 0, end: 120_000_000_000,
      }
      const corruptMinutes = {
        id: `entry-huge-minutes-${index}`, taskId: "task-20", projectId: null,
        start: 0, end: 60_000, minutes: Number.MAX_VALUE,
      }
      for (const [entry, sequence] of [[durationEntry, index], [corruptMinutes, index + 10]] as const) {
        await db.prepare(
          "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES ('entry', ?, ?, 1000, ?, 0, 'app')"
        ).bind(entry.id, JSON.stringify(entry), 100 + sequence).run()
      }
    }
    expect(await d1.sumEntryMinutesByTask!(["task-20", "task-huge"])).toEqual(new Map([
      ["task-20", 13], ["task-huge", 3_000_000],
    ]))
  })

  it("warns once and skips a row with invalid JSON", async () => {
    const db = createTestD1()
    const { data, versions } = fixture()
    await seedD1(db, data, versions)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      const projects = await createD1DataSource(db).projects()
      expect(projects.map((record) => record.value.id)).toEqual(["p-a", "p-b"])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toContain("invalid JSON")
    } finally {
      warn.mockRestore()
    }
  })

  it("simulates D1's UTF-8 LIKE pattern limit", async () => {
    const db = createTestD1()
    await expect(
      db.prepare("SELECT ? LIKE ?").bind("value", `%${"界".repeat(17)}%`).all(),
    ).rejects.toThrow(/LIKE or GLOB pattern too complex/)
  })
})

