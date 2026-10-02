import { beforeAll, describe, expect, it } from "vitest"
import { ToolInputError } from "../../types"
import { queryRecordsTool } from "./query-records"
import { searchTool } from "./search"
import { makeEntry, makeLedger, makeNote, makeProject, makeRoutine, makeTask, makeWorkbench, toolContext } from "./test-support"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

type RecordQueryInput = Parameters<typeof queryRecordsTool.run>[1]
const input = (kind: RecordQueryInput["kind"], extra: Omit<RecordQueryInput, "kind"> = {}): RecordQueryInput => ({ kind, ...extra })

describe("search", () => {
  it("searches records case-insensitively and reports per-kind truncation", async () => {
    const project = makeProject({ name: "Launch studio" })
    const tasks = [
      makeTask({ id: "t-a", seq: 101, title: "Launch report" }),
      makeTask({ id: "t-b", seq: 102, title: "Launch follow-up" }),
    ]
    const ledger = [
      makeLedger({ id: "l-a", note: "Launch payment" }),
      makeLedger({ id: "l-b", note: "Launch refund" }),
    ]
    const ctx = toolContext(makeWorkbench({ projects: [project], tasks, ledger }))
    const result = await searchTool.run(ctx, { query: "LAUNCH", limit: 1 })
    const flags = result.truncatedByKind as Record<string, boolean>

    expect(result.tasks).toHaveLength(1)
    expect(result.projects).toHaveLength(1)
    expect(result.ledger).toHaveLength(1)
    expect(flags).toEqual({ tasks: true, projects: false, ledger: true })
    expect(result.truncated).toBe(true)
    await expect(searchTool.run(ctx, { query: "   " })).rejects.toBeInstanceOf(ToolInputError)
    await expect(searchTool.run(ctx, { query: "launch", limit: 21 })).rejects.toBeInstanceOf(ToolInputError)
  })
})

describe("query_records", () => {
  const project = makeProject({ id: "p-launch", name: "Launch studio" })
  const tasks = [
    makeTask({ id: "t-launch", seq: 101, title: "Launch report", projectId: null, plannedFor: "2026-10-01", dueOn: "2026-10-04", createdAt: Date.parse("2026-10-01T01:00:00Z") }),
    makeTask({ id: "t-follow", seq: 102, title: "Launch follow-up", projectId: project.id, plannedFor: "2026-10-01", dueOn: "2026-10-10", createdAt: Date.parse("2026-10-01T02:00:00Z") }),
    makeTask({ id: "t-other", seq: 103, title: "Unrelated", plannedFor: "2026-09-30", dueOn: "2026-09-29", createdAt: Date.parse("2026-09-29T01:00:00Z") }),
  ]
  const data = makeWorkbench({
    projects: [project],
    tasks,
    entries: [makeEntry({ id: "e-launch", taskId: "t-launch", start: Date.parse("2026-10-01T03:00:00Z"), end: Date.parse("2026-10-01T03:45:00Z") })],
    ledger: [makeLedger({ id: "l-launch", category: "sales", channel: "bank", note: "Launch revenue" })],
    routines: [makeRoutine({ id: "r-launch", title: "Launch checklist", createdOn: "2026-09-01" })],
    notes: [makeNote({ week: "2026-09-28", wins: "Launch shipped" })],
  })

  it("queries all six supported record kinds with their type-specific filters", async () => {
    const ctx = toolContext(data)
    const taskResult = await queryRecordsTool.run(ctx, input("task", {
      dateField: "created", from: "2026-10-01", to: "2026-10-01", status: ["todo"], project: null, text: "launch",
    }))
    expect(taskResult.items).toHaveLength(1)
    expect((taskResult.items as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "t-launch", title: "Launch report", project: null })

    const dueResult = await queryRecordsTool.run(ctx, input("task", { dateField: "due", from: "2026-10-01", to: "2026-10-05" }))
    expect((dueResult.items as Array<Record<string, unknown>>).map((item) => item.id)).toEqual(["t-launch"])

    const ledgerResult = await queryRecordsTool.run(ctx, input("ledger", { category: "sales", channel: "bank", text: "revenue" }))
    expect((ledgerResult.items as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "l-launch", kind: "income" })

    const entryResult = await queryRecordsTool.run(ctx, input("entry", { from: "2026-10-01", to: "2026-10-01", project: null, text: "launch" }))
    expect((entryResult.items as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "e-launch", task: { id: "t-launch" }, minutes: 45 })

    const projectResult = await queryRecordsTool.run(ctx, input("project", { status: ["running"], text: "launch", from: "2026-01-01" }))
    expect((projectResult.items as Array<Record<string, unknown>>)[0]).toMatchObject({ id: project.id, name: project.name })

    const routineResult = await queryRecordsTool.run(ctx, input("routine", { status: ["active"], text: "checklist", from: "2026-09-01" }))
    expect((routineResult.items as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "r-launch", title: "Launch checklist" })

    const noteResult = await queryRecordsTool.run(ctx, input("note", { from: "2026-09-28", to: "2026-10-04", text: "shipped" }))
    expect(noteResult.items).toEqual([{ week: "2026-09-28", wins: "Launch shipped", improve: "", next: "" }])
  })

  it("returns empty local timestamps instead of throwing on out-of-range record dates", async () => {
    const timestamp = Number.MAX_VALUE
    const dangerousTask = makeTask({
      id: "t-out-of-range", seq: 199, title: "Out of range", status: "done", projectId: null,
      plannedFor: null, createdAt: timestamp, completedAt: timestamp,
    })
    const dangerousEntry = makeEntry({ id: "e-out-of-range", taskId: dangerousTask.id, start: timestamp, end: timestamp })
    const ctx = toolContext(makeWorkbench({ tasks: [dangerousTask], entries: [dangerousEntry] }))

    const searched = await searchTool.run(ctx, { query: "Out of range" })
    expect((searched.tasks as Array<Record<string, unknown>>)[0]?.completedAt).toBe("")

    const taskResult = await queryRecordsTool.run(ctx, input("task", { dateField: "created" }))
    expect((taskResult.items as Array<Record<string, unknown>>)[0]?.completedAt).toBe("")
    const entryResult = await queryRecordsTool.run(ctx, input("entry"))
    expect((entryResult.items as Array<Record<string, unknown>>)[0]).toMatchObject({ start: "", end: "" })
  })

  it("pages in stable source order, marks truncation, and validates unsupported filters", async () => {
    const ctx = toolContext(data)
    const first = await queryRecordsTool.run(ctx, input("task", { dateField: "planned", from: "2026-10-01", to: "2026-10-01", limit: 1 }))
    const second = await queryRecordsTool.run(ctx, input("task", { dateField: "planned", from: "2026-10-01", to: "2026-10-01", limit: 1, offset: 1 }))
    expect((first.items as Array<Record<string, unknown>>)[0].id).toBe("t-launch")
    expect(first.truncated).toBe(true)
    expect((second.items as Array<Record<string, unknown>>)[0].id).toBe("t-follow")
    expect(second.truncated).toBe(false)
    await expect(queryRecordsTool.run(ctx, input("note", { status: [] }))).rejects.toBeInstanceOf(ToolInputError)
    await expect(queryRecordsTool.run(ctx, input("entry", { ledgerKind: "income" }))).rejects.toBeInstanceOf(ToolInputError)
    await expect(queryRecordsTool.run(ctx, input("task", { limit: 101 }))).rejects.toBeInstanceOf(ToolInputError)
    await expect(queryRecordsTool.run(ctx, input("task", { offset: Number.MAX_SAFE_INTEGER }))).rejects.toBeInstanceOf(ToolInputError)
  })
})
