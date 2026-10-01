import { addDays, weekStart } from "../../../../src/domain/calendar"
import type { DayKey, ExpenseCategory, IncomeCategory, TaskStatus, WeekNote } from "../../../../src/domain/types"
import { assertDay, assertRange } from "../shared/dates"
import { resolveProject } from "../shared/refs"
import { LIMIT, PROJECT_REF } from "../shared/schema"
import { presentEntry, presentLedger, presentProject, presentRoutine, presentTask, presentationContext, taskMap, values } from "./common"
import { ToolInputError } from "../../types"
import type { EntryQuery, LedgerQuery, ReadTool, TaskQuery, Versioned } from "../../types"

const KINDS = ["task", "ledger", "entry", "project", "routine", "note"] as const
const TASK_STATUSES: readonly TaskStatus[] = ["backlog", "todo", "doing", "done", "dropped"]
const LEDGER_STATUSES = ["pending", "received", "refunded"] as const
const PROJECT_STAGES = ["idea", "building", "running", "paused", "ended"] as const
const TASK_DATE_FIELDS = ["planned", "due", "completed", "created"] as const
const CATEGORIES = ["sales", "subscription", "sponsor", "consulting", "ads", "other-income", "server", "domain", "ai", "tools", "design", "marketing", "other-expense"] as const
const MAX_OFFSET = Number.MAX_SAFE_INTEGER - 101

interface QueryRecordsInput {
  kind: (typeof KINDS)[number]
  from?: string
  to?: string
  dateField?: (typeof TASK_DATE_FIELDS)[number]
  status?: string[]
  project?: string | null
  ledgerKind?: "income" | "expense"
  category?: IncomeCategory | ExpenseCategory
  channel?: string
  text?: string
  limit?: number
  offset?: number
}

function assertAllowed(valuesToCheck: readonly string[] | undefined, allowed: readonly string[], field: string): string[] | undefined {
  if (valuesToCheck === undefined) return undefined
  const invalid = valuesToCheck.filter((value) => !allowed.includes(value))
  if (invalid.length > 0) throw new ToolInputError(`Invalid ${field} value(s): ${invalid.join(", ")}.`)
  return [...valuesToCheck]
}

function page<T>(items: T[], offset: number, limit: number): { items: T[]; truncated: boolean } {
  return { items: items.slice(offset, offset + limit), truncated: items.length > offset + limit }
}

function contains(value: string, text: string): boolean {
  return value.toLocaleLowerCase().includes(text.toLocaleLowerCase())
}

function assertNoLedgerFilters(input: QueryRecordsInput): void {
  if (input.ledgerKind !== undefined || input.category !== undefined || input.channel !== undefined) {
    throw new ToolInputError("\"ledgerKind\", \"category\", and \"channel\" only apply to ledger records.")
  }
}

export const queryRecordsTool: ReadTool<QueryRecordsInput> = {
  kind: "read",
  name: "query_records",
  title: "Query records",
  description: "Filter and page through one record type using dates, status, project, and text. Use it when you need a focused record list to inspect or analyze yourself.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: KINDS, description: "Record type to query." },
      from: { ...({ type: "string" }), description: "Inclusive local start date, YYYY-MM-DD." },
      to: { ...({ type: "string" }), description: "Inclusive local end date, YYYY-MM-DD." },
      dateField: { type: "string", enum: TASK_DATE_FIELDS, default: "planned", description: "Task date field to filter; defaults to planned day." },
      status: { type: "array", items: { type: "string", enum: [...TASK_STATUSES, ...LEDGER_STATUSES, ...PROJECT_STAGES, "active", "archived"] } },
      project: PROJECT_REF,
      ledgerKind: { type: "string", enum: ["income", "expense"] },
      category: { type: "string", minLength: 1, enum: CATEGORIES },
      channel: { type: "string", enum: ["alipay", "wechat", "bank", "platform", "card"] },
      text: { type: "string", maxLength: 80 },
      limit: LIMIT(50, 100),
      offset: { type: "integer", minimum: 0, maximum: MAX_OFFSET, default: 0, description: "Number of matching records to skip." },
    },
    required: ["kind"],
    additionalProperties: false,
  },
  async run(ctx, input) {
    const limit = input.limit ?? 50
    const offset = input.offset ?? 0
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ToolInputError("\"limit\" must be an integer from 1 to 100.")
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_OFFSET) throw new ToolInputError(`"offset" must be an integer from 0 to ${MAX_OFFSET}.`)
    const from = input.from === undefined ? undefined : assertDay(input.from, "from")
    const to = input.to === undefined ? undefined : assertDay(input.to, "to")
    if (input.kind === "note" && input.project !== undefined) throw new ToolInputError("\"project\" does not apply to week notes.")
    if (from !== undefined && to !== undefined) assertRange(from, to, Number.MAX_SAFE_INTEGER, "query_records")
    if (input.kind !== "task" && input.dateField !== undefined) throw new ToolInputError("\"dateField\" only applies to task records.")

    const needsProjects = input.kind !== "note" || input.project !== undefined
    const projectRecords = needsProjects ? await ctx.data.projects() : []
    const selectedProject = input.project === undefined ? undefined : resolveProject(input.project, projectRecords)
    const projectId = selectedProject === undefined ? undefined : selectedProject === null ? null : selectedProject.value.id
    const present = presentationContext(ctx, projectRecords)

    switch (input.kind) {
      case "task": {
        assertNoLedgerFilters(input)
        const statuses = assertAllowed(input.status, TASK_STATUSES, "task status") as TaskStatus[] | undefined
        const dateField = input.dateField ?? "planned"
        const query: TaskQuery = {
          ...(statuses === undefined ? {} : { statuses }),
          ...(projectId === undefined ? {} : { projectId }),
          ...(input.text === undefined ? {} : { text: input.text }),
        }
        if (dateField === "planned") {
          if (from !== undefined) query.plannedFrom = from
          if (to !== undefined) query.plannedTo = to
        } else if (dateField === "due") {
          if (to !== undefined) query.dueTo = to
        } else if (dateField === "completed") {
          if (from !== undefined) query.completedFrom = ctx.clock.startOfDay(from)
          if (to !== undefined) query.completedTo = ctx.clock.startOfDay(addDays(to, 1))
        }
        const localDateFilter = dateField === "created" || (dateField === "due" && from !== undefined)
        if (!localDateFilter) query.limit = offset + limit + 1
        const found = values(await ctx.data.tasks(query)).filter((task) => {
          if (dateField === "created") {
            const day = ctx.clock.dayOf(task.createdAt)
            return (from === undefined || day >= from) && (to === undefined || day <= to)
          }
          if (dateField === "due" && from !== undefined) return task.dueOn !== null && task.dueOn >= from
          return true
        })
        const result = page(found, offset, limit)
        return { items: result.items.map((task) => presentTask(task, present)), truncated: result.truncated }
      }
      case "ledger": {
        const statuses = assertAllowed(input.status, LEDGER_STATUSES, "ledger status") as (typeof LEDGER_STATUSES)[number][] | undefined
        const localFilter = input.category !== undefined || input.channel !== undefined
        const query: LedgerQuery = {
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
          ...(statuses === undefined ? {} : { statuses }),
          ...(input.ledgerKind === undefined ? {} : { kinds: [input.ledgerKind] }),
          ...(projectId === undefined ? {} : { projectId }),
          ...(input.text === undefined ? {} : { text: input.text }),
        }
        if (!localFilter) query.limit = offset + limit + 1
        const found = values(await ctx.data.ledger(query)).filter((entry) =>
          (input.category === undefined || entry.category === input.category) &&
          (input.channel === undefined || entry.channel === input.channel)
        )
        const result = page(found, offset, limit)
        return { items: result.items.map((entry) => presentLedger(entry, present)), truncated: result.truncated }
      }
      case "entry": {
        if (input.status !== undefined) throw new ToolInputError("\"status\" does not apply to time entries.")
        assertNoLedgerFilters(input)
        const localFilter = input.text !== undefined
        const query: EntryQuery = {
          ...(from === undefined ? {} : { from: ctx.clock.startOfDay(from) }),
          ...(to === undefined ? {} : { to: ctx.clock.startOfDay(addDays(to, 1)) }),
          ...(projectId === undefined ? {} : { projectId }),
        }
        if (!localFilter) query.limit = offset + limit + 1
        const found = values(await ctx.data.entries(query))
        const linkedIds = [...new Set(found.flatMap((entry) => entry.taskId === null ? [] : [entry.taskId]))]
        const linkedTasks = linkedIds.length > 0 ? values(await ctx.data.tasks({ ids: linkedIds })) : []
        const tasksById = taskMap(linkedTasks)
        const projectsById = new Map(projectRecords.map(({ value }) => [value.id, value]))
        const filtered = found.filter((entry) => input.text === undefined ||
          (entry.taskId !== null && contains(tasksById.get(entry.taskId)?.title ?? "", input.text)) ||
          (entry.projectId !== null && contains(projectsById.get(entry.projectId)?.name ?? "", input.text))
        )
        const result = page(filtered, offset, limit)
        return { items: result.items.map((entry) => presentEntry(entry, present, tasksById)), truncated: result.truncated }
      }
      case "project": {
        assertNoLedgerFilters(input)
        const statuses = assertAllowed(input.status, PROJECT_STAGES, "project status")
        if (input.status?.some((status) => status === "active" || status === "archived")) {
          throw new ToolInputError("Project status must be one of idea, building, running, paused, or ended.")
        }
        const found = values(projectRecords).filter((project) =>
          (projectId === undefined || project.id === projectId) &&
          (statuses === undefined || statuses.includes(project.stage)) &&
          (input.text === undefined || contains(project.name, input.text)) &&
          (from === undefined || project.startedOn >= from) &&
          (to === undefined || project.startedOn <= to)
        )
        const result = page(found, offset, limit)
        return { items: result.items.map(presentProject), truncated: result.truncated }
      }
      case "routine": {
        assertNoLedgerFilters(input)
        const statuses = assertAllowed(input.status, ["active", "archived"], "routine status")
        const found = values(await ctx.data.routines()).filter((routine) =>
          (projectId === undefined || routine.projectId === projectId) &&
          (statuses === undefined || statuses.includes(routine.archived ? "archived" : "active")) &&
          (input.text === undefined || contains(routine.title, input.text)) &&
          (from === undefined || routine.createdOn >= from) &&
          (to === undefined || routine.createdOn <= to)
        )
        const result = page(found, offset, limit)
        return { items: result.items.map((routine) => presentRoutine(routine, present)), truncated: result.truncated }
      }
      case "note": {
        if (input.status !== undefined) throw new ToolInputError("\"status\" does not apply to week notes.")
        assertNoLedgerFilters(input)
        if (input.project !== undefined) throw new ToolInputError("\"project\" does not apply to week notes.")
        const startWeek = from === undefined ? undefined : weekStart(from)
        const endWeek = to === undefined ? undefined : weekStart(to)
        let records: Versioned<WeekNote>[]
        if (startWeek !== undefined && endWeek !== undefined) {
          const span = Math.floor((Date.parse(`${endWeek}T00:00:00Z`) - Date.parse(`${startWeek}T00:00:00Z`)) / 604_800_000)
          if (span > 520) records = await ctx.data.notes()
          else {
            const weeks: DayKey[] = []
            for (let week = startWeek; week <= endWeek; week = addDays(week, 7)) weeks.push(week)
            records = await ctx.data.notes(weeks)
          }
        } else {
          records = await ctx.data.notes()
        }
        const found = values(records).filter((note) =>
          (startWeek === undefined || note.week >= startWeek) &&
          (endWeek === undefined || note.week <= endWeek) &&
          (input.text === undefined || [note.wins, note.improve, note.next].some((text) => contains(text, input.text!)))
        )
        const result = page(found, offset, limit)
        return { items: result.items.map((note) => ({ week: note.week, wins: note.wins, improve: note.improve, next: note.next })), truncated: result.truncated }
      }
    }
  },
}
