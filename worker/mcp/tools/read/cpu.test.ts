import { beforeAll, describe, expect, it } from "vitest"
import { addDays } from "../../../../src/domain/calendar"
import { summarizeProject } from "../../../../src/domain/projects"
import { isOpen, sortTasks } from "../../../../src/domain/tasks"
import type { LedgerEntry, Task, TimeEntry, WeekNote, WorkbenchData } from "../../../../src/domain/types"
import { SINGLETON_ID, type RecordKind } from "../../../../src/sync/protocol"
import { createD1DataSource } from "../../data/d1"
import { toWallWorkbench } from "../../data/wall"
import { createTestD1 } from "../../../testing/d1-sqlite.mjs"
import type { TestD1Database } from "../../../testing/d1-sqlite.d.mts"
import { getDayTool } from "./get-day"
import { getProjectTool } from "./get-project"
import { getStatsTool } from "./get-stats"
import { getWeekReviewTool } from "./get-week-review"
import { getWeekTool } from "./get-week"
import { listProjectsTool } from "./list-projects"
import { queryRecordsTool } from "./query-records"
import { searchTool } from "./search"
import { makeLedger, makeNote, makeProject, makeRoutine, makeTask, makeWorkbench, toolContext } from "./test-support"
import { presentLedger, presentProject, presentTask, presentationContext, values } from "./common"
import type { DataSource } from "../../types"

declare const process: { env: Record<string, string | undefined>; cpuUsage(previous?: { user: number; system: number }): { user: number; system: number } }

beforeAll(() => {
  process.env.TZ = "UTC"
})

interface BenchmarkScale {
  name: string
  start: string
  days: number
  taskCount: number
  entryCount: number
  ledgerCount: number
}

interface QuerySnapshot {
  sql: string
  bindings: unknown[]
  rows: Record<string, unknown>[]
}

interface ToolCase {
  name: string
  run(source: DataSource, data: WorkbenchData): Promise<unknown>
}

interface Replay {
  source: DataSource
  reset(): void
  assertConsumed(): void
  validate: boolean
}

const tools: ToolCase[] = [
  { name: "get_day", run: (source, data) => getDayTool.run(toolContext(data, undefined, source), {}) },
  { name: "get_week", run: (source, data) => getWeekTool.run(toolContext(data, undefined, source), { date: "2026-10-01" }) },
  { name: "list_projects", run: (source, data) => listProjectsTool.run(toolContext(data, undefined, source), {}) },
  { name: "get_project", run: (source, data) => getProjectTool.run(toolContext(data, undefined, source), { project: "p-0" }) },
  { name: "get_stats", run: (source, data) => getStatsTool.run(toolContext(data, undefined, source), { range: "year" }) },
  { name: "get_week_review", run: (source, data) => getWeekReviewTool.run(toolContext(data, undefined, source), { week: "2026-10-01" }) },
  { name: "search", run: (source, data) => searchTool.run(toolContext(data, undefined, source), { query: "market" }) },
  {
    name: "query_records",
    run: (source, data) => queryRecordsTool.run(toolContext(data, undefined, source), {
      kind: "ledger", from: dataStart(data), to: "2026-10-01", category: "sales", limit: 50,
    }),
  },
]

function dataStart(data: WorkbenchData): string {
  const dates = data.tasks.map((task) => task.createdAt).sort((a, b) => a - b)
  return new Date(dates[0]).toISOString().slice(0, 10)
}

async function legacyGetProject(source: DataSource, data: WorkbenchData): Promise<Record<string, unknown>> {
  const ctx = toolContext(data, undefined, source)
  const projectRecords = await source.projects()
  const selected = projectRecords.find(({ value }) => value.id === "p-0")
  if (selected === undefined) throw new Error("Benchmark project p-0 was not found.")
  const project = selected.value
  const [taskRecords, ledgerRecords, entryRecords] = await Promise.all([
    source.tasks({ projectId: project.id }),
    source.ledger({ projectId: project.id }),
    source.entries({ projectId: project.id }),
  ])
  const tasks = values(taskRecords)
  const ledger = values(ledgerRecords)
  const entries = values(entryRecords)
  const wall = toWallWorkbench({ projects: [project], tasks, ledger, entries }, ctx.clock)
  const summary = summarizeProject(wall, wall.projects[0], ctx.clock.today)
  const open = sortTasks(tasks.filter(isOpen), "priority")
  const completed = tasks.filter((task) => task.status === "done" && task.completedAt !== null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const recentLedger = [...ledger].sort((a, b) => b.date.localeCompare(a.date))
  const present = presentationContext(ctx, projectRecords)
  return {
    project: presentProject(project),
    month: {
      income: summary.month.income,
      expense: summary.month.expense,
      net: summary.month.net,
      minutes: summary.month.minutes,
      hourlyRate: summary.month.rate,
    },
    totalNet: summary.totalNet,
    totalMinutes: summary.totalMinutes,
    monthlyTargetProgressPercent: project.monthlyTarget === null || project.monthlyTarget === 0
      ? null
      : Math.round((Math.max(0, summary.month.net) / project.monthlyTarget) * 100),
    milestones: {
      done: summary.milestonesDone,
      total: project.milestones.length,
      next: summary.nextMilestone,
      // 基准数据里没有里程碑，这里只要和现在的输出形状一致
      items: project.milestones.map(({ id, title, due, doneOn }) => ({ id, title, due, doneOn })),
      itemsTruncated: false,
    },
    weeks: summary.weeks,
    lastActive: summary.lastActive,
    openTasks: open.length,
    openTaskItems: open.slice(0, 30).map((task) => presentTask(task, present)),
    openTasksTruncated: open.length > 30,
    recentCompleted: completed.slice(0, 10).map((task) => presentTask(task, present)),
    recentCompletedTruncated: completed.length > 10,
    recentLedger: recentLedger.slice(0, 10).map((entry) => presentLedger(entry, present)),
    recentLedgerTruncated: recentLedger.length > 10,
    truncated: open.length > 30 || completed.length > 10 || recentLedger.length > 10,
  }
}

function ordinaryScale(): BenchmarkScale {
  return { name: "ordinary-1y", start: "2025-10-02", days: 365, taskCount: 1000, entryCount: 2500, ledgerCount: 800 }
}

function heavyScale(): BenchmarkScale {
  const start = "2023-10-02"
  const end = "2026-10-01"
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
  return { name: "heavy-3y", start, days, taskCount: days * 8, entryCount: days * 2, ledgerCount: days * 3 }
}

function benchmarkData(scale: BenchmarkScale): WorkbenchData {
  const projects = Array.from({ length: 10 }, (_, index) => makeProject({ id: `p-${index}`, name: `Project ${index}` }))
  const routines = Array.from({ length: 10 }, (_, index) => makeRoutine({ id: `r-${index}`, title: `Routine ${index}`, estimateMin: 10 + index }))
  const dateAt = (index: number, count: number) => addDays(scale.start, Math.floor(index * scale.days / count))
  const tasks: Task[] = Array.from({ length: scale.taskCount }, (_, index) => {
    const day = dateAt(index, scale.taskCount)
    const done = index % 4 === 0
    const project = projects[index % projects.length]
    return makeTask({
      id: `t-${index}`,
      seq: 100 + index,
      title: index % 4 === 0 ? `Market task ${day} ${index}` : `Daily task ${day} ${index}`,
      projectId: project.id,
      status: done ? "done" : index % 2 === 0 ? "doing" : "todo",
      priority: index % 5 as 0 | 1 | 2 | 3 | 4,
      estimateMin: 25 + index % 60,
      plannedFor: index % 5 === 0 ? null : day,
      dueOn: index % 3 === 0 ? addDays(day, (index % 9) - 4) : null,
      createdAt: Date.parse(`${day}T02:00:00Z`),
      completedAt: done ? Date.parse(`${day}T08:00:00Z`) : null,
    })
  })
  const entries: TimeEntry[] = Array.from({ length: scale.entryCount }, (_, index) => {
    const task = tasks[index % tasks.length]
    const day = dateAt(index, scale.entryCount)
    const start = Date.parse(`${day}T01:00:00Z`) + (index % 8) * 3_600_000
    return { id: `e-${index}`, taskId: task.id, projectId: task.projectId, start, end: start + (15 + index % 45) * 60_000 }
  })
  const ledger: LedgerEntry[] = Array.from({ length: scale.ledgerCount }, (_, index) => {
    const day = dateAt(index, scale.ledgerCount)
    return makeLedger({
      id: `l-${index}`,
      kind: index % 4 === 0 ? "expense" : "income",
      category: index % 4 === 0 ? "tools" : "sales",
      projectId: index % 11 === 0 ? null : projects[index % projects.length].id,
      amount: 20 + index % 100,
      status: index % 10 === 0 ? "pending" : "received",
      date: day,
      note: index % 4 === 1 ? "market revenue" : "operating cost",
      createdAt: Date.parse(`${day}T03:00:00Z`),
    })
  })
  const notes: WeekNote[] = []
  for (let dayIndex = 0; dayIndex < scale.days; dayIndex += 1) {
    const day = addDays(scale.start, dayIndex)
    if (new Date(`${day}T00:00:00Z`).getUTCDay() === 1) notes.push(makeNote({ week: day, wins: `Week of ${day}` }))
  }
  return makeWorkbench({ projects, tasks, entries, ledger, routines, notes })
}

async function seedData(db: TestD1Database, data: WorkbenchData): Promise<void> {
  const rows: Array<{ kind: RecordKind; id: string; value: unknown }> = [
    ...data.projects.map((value) => ({ kind: "project" as const, id: value.id, value })),
    ...data.tasks.map((value) => ({ kind: "task" as const, id: value.id, value })),
    ...data.entries.map((value) => ({ kind: "entry" as const, id: value.id, value })),
    ...data.ledger.map((value) => ({ kind: "ledger" as const, id: value.id, value })),
    ...data.routines.map((value) => ({ kind: "routine" as const, id: value.id, value })),
    ...data.notes.map((value) => ({ kind: "note" as const, id: value.week, value })),
    { kind: "profile", id: SINGLETON_ID, value: data.profile },
  ]
  const sql = "INSERT INTO records (kind, id, data, updated_at, rev, deleted, source) VALUES (?, ?, ?, 1, ?, 0, 'app')"
  for (let offset = 0; offset < rows.length; offset += 500) {
    const statements = rows.slice(offset, offset + 500).map((row, index) =>
      db.prepare(sql).bind(row.kind, row.id, JSON.stringify(row.value), offset + index + 1)
    )
    await db.batch(statements)
  }
}

function copyRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }))
}

function recordingDataSource(db: TestD1Database, snapshots: QuerySnapshot[]): DataSource {
  const recordingDb = {
    prepare(sql: string) {
      const wrap = (statement: ReturnType<TestD1Database["prepare"]>, bindings: unknown[] = []) => ({
        bind(...values: unknown[]) { return wrap(statement.bind(...values), values) },
        async all<T = Record<string, unknown>>() {
          const result = await statement.all<T>()
          snapshots.push({ sql, bindings, rows: copyRows(result.results as Record<string, unknown>[]) })
          return result
        },
        async first<T = Record<string, unknown>>() {
          const result = await statement.first<T>()
          snapshots.push({ sql, bindings, rows: result === null ? [] : copyRows([result as Record<string, unknown>]) })
          return result
        },
      })
      return wrap(db.prepare(sql))
    },
  }
  return createD1DataSource(recordingDb as unknown as D1Database)
}

function replayDataSource(db: TestD1Database, snapshots: QuerySnapshot[]): Replay {
  let cursor = 0
  let validate = true
  const next = (sql: string, bindings: unknown[]): QuerySnapshot => {
    const snapshot = snapshots[cursor]
    cursor += 1
    if (snapshot === undefined) throw new Error(`Replay requested extra query: ${sql}`)
    if (validate && (snapshot.sql !== sql || JSON.stringify(snapshot.bindings) !== JSON.stringify(bindings))) {
      throw new Error(`Replay query ${cursor} differed from the recorded SQL or bindings.`)
    }
    return snapshot
  }
  const replayDb = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T = Record<string, unknown>>() {
              const snapshot = next(sql, bindings)
              return { results: snapshot.rows as unknown as T[] }
            },
            async first<T = Record<string, unknown>>() {
              const snapshot = next(sql, bindings)
              return (snapshot.rows[0] as unknown as T | undefined) ?? null
            },
          }
        },
      }
    },
  }
  const replay: Replay = {
    source: createD1DataSource(replayDb as unknown as D1Database),
    reset() { cursor = 0 },
    assertConsumed() {
      if (cursor !== snapshots.length) throw new Error(`Replay consumed ${cursor} of ${snapshots.length} recorded queries.`)
    },
    get validate() { return validate },
    set validate(value: boolean) { validate = value },
  }
  return replay
}

async function measureReplay(run: () => Promise<unknown>, replay: Replay, repetitions = 25): Promise<number> {
  replay.validate = true
  for (let index = 0; index < 2; index += 1) {
    replay.reset()
    await run()
    replay.assertConsumed()
  }
  replay.validate = false
  const started = process.cpuUsage()
  for (let index = 0; index < repetitions; index += 1) {
    replay.reset()
    await run()
    replay.assertConsumed()
  }
  const elapsed = process.cpuUsage(started)
  return (elapsed.user + elapsed.system) / 1000 / repetitions
}

async function benchmarkScale(scale: BenchmarkScale): Promise<Record<string, { beforeMs: number; ms: number; rows: number; queries: number }>> {
  const data = benchmarkData(scale)
  const db = createTestD1()
  await seedData(db, data)
  const measurements: Record<string, { beforeMs: number; ms: number; rows: number; queries: number }> = {}
  for (const tool of tools) {
    const snapshots: QuerySnapshot[] = []
    const source = recordingDataSource(db, snapshots)
    const recordedOutput = await tool.run(source, data)
    expect(snapshots.every((snapshot) => snapshot.rows.every((row) => row.data === undefined || typeof row.data === "string"))).toBe(true)
    const replay = replayDataSource(db, snapshots)
    replay.reset()
    const replayOutput = await tool.run(replay.source, data)
    replay.assertConsumed()
    expect(replayOutput).toEqual(recordedOutput)
    const ms = await measureReplay(() => tool.run(replay.source, data), replay)
    let beforeMs = ms
    if (tool.name === "get_project") {
      replay.validate = true
      replay.reset()
      const legacyOutput = await legacyGetProject(replay.source, data)
      replay.assertConsumed()
      expect(legacyOutput).toEqual(recordedOutput)
      beforeMs = await measureReplay(() => legacyGetProject(replay.source, data), replay)
    }
    measurements[tool.name] = {
      beforeMs: Number(beforeMs.toFixed(3)),
      ms: Number(ms.toFixed(3)),
      rows: snapshots.reduce((sum, snapshot) => sum + snapshot.rows.length, 0),
      queries: snapshots.length,
    }
  }
  const recordCount = data.projects.length + data.tasks.length + data.entries.length + data.ledger.length + data.routines.length + data.notes.length + 1
  console.log(`Worker replay CPU ${scale.name} (${recordCount} DB rows; tasks=${data.tasks.length}, entries=${data.entries.length}, ledger=${data.ledger.length}): ${JSON.stringify(measurements)}`)
  return measurements
}

describe("read tools Worker CPU replay benchmark", () => {
  it("replays raw D1 rows at ordinary one-year and heavy three-year scales", async () => {
    const ordinary = await benchmarkScale(ordinaryScale())
    const heavy = await benchmarkScale(heavyScale())
    expect(Object.keys(ordinary)).toHaveLength(8)
    expect(Object.keys(heavy)).toHaveLength(8)
    expect([...Object.values(ordinary), ...Object.values(heavy)].every((result) => Number.isFinite(result.beforeMs) && Number.isFinite(result.ms) && result.rows > 0 && result.queries > 0)).toBe(true)
  }, 120_000)
})
