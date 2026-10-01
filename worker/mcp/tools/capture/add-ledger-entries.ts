import { newEntry, type EntryInput } from "../../../../src/domain/operations"
import type { DayKey, EntryKind, EntryStatus, LedgerEntry } from "../../../../src/domain/types"
import { createChange } from "../shared/changes"
import { presentLedger } from "../shared/present"
import { DAY, PROJECT_REF, REASON } from "../shared/schema"
import { assertDay } from "../shared/dates"
import { resolveProject } from "../shared/refs"
import type { PlannedChange, Versioned, WritePlan, WriteTool } from "../../types"
import { ToolInputError } from "../../types"
import { makePresentContext, operationContext } from "./helpers"

const INCOME_CATEGORIES = ["sales", "subscription", "sponsor", "consulting", "ads", "other-income"] as const
const EXPENSE_CATEGORIES = ["server", "domain", "ai", "tools", "design", "marketing", "other-expense"] as const
const CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]

interface LedgerInput {
  kind: EntryKind
  amount: number
  project?: string | null
  category?: LedgerEntry["category"]
  channel?: LedgerEntry["channel"]
  status?: EntryStatus
  date?: DayKey
  expectedOn?: DayKey
  note?: string
  externalId?: string
}

interface AddLedgerInput {
  entries: LedgerInput[]
  allowDuplicates?: boolean
  reason?: string
}

function sameLedgerIdentity(left: LedgerEntry, right: LedgerEntry): boolean {
  return left.date === right.date && left.kind === right.kind && left.amount === right.amount && left.projectId === right.projectId
}

function isCategoryForKind(kind: EntryKind, category: LedgerEntry["category"]): boolean {
  return kind === "income"
    ? (INCOME_CATEGORIES as readonly string[]).includes(category)
    : (EXPENSE_CATEGORIES as readonly string[]).includes(category)
}

export const addLedgerEntriesTool: WriteTool<unknown> = {
  kind: "write",
  name: "add_ledger_entries",
  title: "Add ledger entries",
  description: "Record one or more income or expense entries with duplicate checks. Use it when the user asks to capture transactions; changes may be queued for the user's approval.",
  destructive: false,
  inputSchema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["income", "expense"] },
            amount: { type: "number", exclusiveMinimum: 0, multipleOf: 0.01 },
            project: PROJECT_REF,
            category: { type: "string", enum: CATEGORIES },
            channel: { type: "string", enum: ["alipay", "wechat", "bank", "platform", "card"] },
            status: { type: "string", enum: ["received", "pending"] },
            date: DAY,
            expectedOn: DAY,
            note: { type: "string", maxLength: 200 },
            externalId: { type: "string", maxLength: 120 },
          },
          required: ["kind", "amount"],
          additionalProperties: false,
        },
      },
      allowDuplicates: { type: "boolean", default: false },
      reason: REASON,
    },
    required: ["entries"],
    additionalProperties: false,
  },
  async plan(ctx, value): Promise<WritePlan> {
    const input = value as AddLedgerInput
    const projects = input.entries.some((entry) => typeof entry.project === "string")
      ? await ctx.data.projects()
      : []
    const normalized = input.entries.map((entry, index) => {
      const date = entry.date ?? ctx.clock.today
      assertDay(date, `entries[${index}].date`)
      if (entry.expectedOn !== undefined) assertDay(entry.expectedOn, `entries[${index}].expectedOn`)
      const scaledAmount = entry.amount * 100
      const cents = Math.round(scaledAmount)
      const tolerance = Number.EPSILON * Math.abs(scaledAmount)
      if (!Number.isFinite(entry.amount) || entry.amount <= 0 || !Number.isFinite(scaledAmount) || Math.abs(scaledAmount - cents) > tolerance) {
        throw new ToolInputError(`entries[${index}].amount must be positive and have at most two decimal places.`)
      }
      const amount = cents / 100
      const status = entry.status ?? "received"
      if (entry.kind === "expense" && status === "pending") {
        throw new ToolInputError(`entries[${index}].status cannot be "pending" for an expense.`)
      }
      if (entry.expectedOn !== undefined && status !== "pending") {
        throw new ToolInputError(`entries[${index}].expectedOn is only valid when status is pending.`)
      }
      const category = entry.category ?? (entry.kind === "income" ? "other-income" : "other-expense")
      if (!isCategoryForKind(entry.kind, category)) {
        throw new ToolInputError(`entries[${index}].category does not match kind "${entry.kind}".`)
      }
      const project = resolveProject(entry.project, projects)
      const externalId = entry.externalId?.trim() || undefined
      return {
        index,
        projectId: project?.value.id ?? null,
        input: {
          kind: entry.kind,
          amount,
          projectId: project?.value.id ?? null,
          category,
          channel: entry.channel ?? "platform",
          status,
          date,
          expectedOn: status === "pending" ? entry.expectedOn ?? null : null,
          note: entry.note ?? "",
          ...(externalId === undefined ? {} : { externalId }),
        } satisfies EntryInput,
      }
    })

    const allowDuplicates = input.allowDuplicates ?? false
    let existingByExternal: Versioned<LedgerEntry>[] = []
    let existingByDate: Versioned<LedgerEntry>[] = []
    const externalIds = [...new Set(normalized.flatMap(({ input: entry }) => entry.externalId ? [entry.externalId] : []))]
    const dates = normalized.map(({ input: entry }) => entry.date)
    const [external, dated] = await Promise.all([
      externalIds.length > 0 ? ctx.data.ledger({ externalIds }) : Promise.resolve([]),
      allowDuplicates
        ? Promise.resolve([])
        : ctx.data.ledger({ from: dates.reduce((a, b) => a < b ? a : b), to: dates.reduce((a, b) => a > b ? a : b) }),
    ])
    existingByExternal = external
    existingByDate = dated

    const changes: PlannedChange[] = []
    const created: unknown[] = []
    const skipped: Record<string, unknown>[] = []
    const accepted: LedgerEntry[] = []
    const seenExternalIds = new Map<string, number>()
    const presentProjects = makePresentContext(ctx.clock, projects)

    for (const candidate of normalized) {
      const draft = { ...candidate.input, id: "", createdAt: ctx.clock.now } as LedgerEntry
      const existingExternal = draft.externalId
        ? existingByExternal.find(({ value: existing }) => existing.externalId === draft.externalId)?.value
        : undefined
      if (existingExternal) {
        skipped.push({ index: candidate.index, reason: "An entry with this external id already exists.", existingId: existingExternal.id })
        continue
      }
      const earlierIndex = draft.externalId === undefined ? undefined : seenExternalIds.get(draft.externalId)
      if (draft.externalId !== undefined && earlierIndex !== undefined) {
        skipped.push({ index: candidate.index, reason: "An earlier entry in this batch uses the same external id.", duplicateOf: earlierIndex })
        continue
      }
      if (draft.externalId !== undefined) seenExternalIds.set(draft.externalId, candidate.index)

      if (!allowDuplicates) {
        const duplicate = existingByDate.find(({ value: existing }) => sameLedgerIdentity(existing, draft))?.value
          ?? accepted.find((existing) => sameLedgerIdentity(existing, draft))
        if (duplicate) {
          skipped.push({ index: candidate.index, reason: "A same-day entry with the same kind, amount, and project already exists.", existingId: duplicate.id })
          continue
        }
      }

      const entry = { ...newEntry(candidate.input, operationContext(ctx)), origin: "ai" as const }
      const existingRecord = await ctx.data.record("ledger", entry.id)
      changes.push(createChange("ledger", entry.id, entry, existingRecord))
      created.push(presentLedger(entry, presentProjects))
      accepted.push(entry)
    }

    const warnings = skipped.length > 0 ? [`Skipped ${skipped.length} possible duplicate ledger entr${skipped.length === 1 ? "y" : "ies"}.`] : undefined
    return {
      changes,
      output: { created, skipped },
      ...(warnings ? { warnings } : {}),
      reason: input.reason ?? null,
    }
  },
}
