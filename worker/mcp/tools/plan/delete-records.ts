import { deleteChange, singletonChange } from "../shared/changes"
import { presentEntry, presentLedger, presentTask } from "../shared/present"
import { REASON } from "../shared/schema"
import { resolveTasks } from "../shared/refs"
import { ToolInputError, MAX_CHANGES_PER_CALL, type PlannedChange, type WriteTool } from "../../types"
import type { LedgerEntry, TimeEntry } from "../../../../src/domain/types"
import type { Versioned } from "../../types"
import { assertUnique, inputObject, optionalReason, presentContext } from "./helpers"

const KINDS = ["task", "ledger", "entry"] as const
type DeleteKind = (typeof KINDS)[number]
interface DeleteItem {
  kind: DeleteKind
  id: string
}

function parseItem(value: unknown, index: number): DeleteItem {
  const item = inputObject(value, `items[${index}]`)
  if (!KINDS.includes(item.kind as DeleteKind)) throw new ToolInputError(`Item ${index + 1} kind must be task, ledger, or entry.`)
  if (typeof item.id !== "string" || item.id.trim().length === 0) throw new ToolInputError(`Item ${index + 1} must have a non-empty id.`)
  return { kind: item.kind as DeleteKind, id: item.id }
}

export const deleteRecordsTool: WriteTool<unknown> = {
  kind: "write",
  name: "delete_records",
  title: "Delete records",
  description: "Delete tasks, ledger entries, or time entries and stop a timer attached to a deleted task. Use this only when the user explicitly asks to remove records; every deletion is destructive and may be queued for the user's approval.",
  destructive: true,
  alwaysPreview: true,
  inputSchema: {
    type: "object",
    properties: {
      items: {
        type: "array", minItems: 1, maxItems: 20,
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: KINDS },
            id: { type: "string", minLength: 1 },
          },
          required: ["kind", "id"], additionalProperties: false,
        },
      },
      reason: REASON,
    },
    required: ["items"], additionalProperties: false,
  },
  async plan(ctx, value) {
    const input = inputObject(value, "delete_records input")
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) {
      throw new ToolInputError('Field "items" must contain 1–20 records.')
    }
    const items = input.items.map(parseItem)
    assertUnique(items.map(({ kind, id }) => `${kind}:${id}`), "items")
    const byKind = new Map<DeleteKind, string[]>()
    for (const item of items) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item.id])
    const taskRefs = byKind.get("task") ?? []
    const [resolvedTaskRefs, ledger, entries, timer, projects] = await Promise.all([
      resolveTasks(ctx.data, taskRefs),
      byKind.has("ledger") ? ctx.data.ledger({ ids: byKind.get("ledger") }) : Promise.resolve([] as Versioned<LedgerEntry>[]),
      byKind.has("entry") ? ctx.data.entries({ ids: byKind.get("entry") }) : Promise.resolve([] as Versioned<TimeEntry>[]),
      ctx.data.timer(),
      ctx.data.projects(),
    ])
    const resolvedTaskIds = taskRefs.map((ref) => resolvedTaskRefs.get(ref)!.value.id)
    assertUnique(resolvedTaskIds, "items")
    const tasks = [...new Map([...resolvedTaskRefs.values()].map((record) => [record.value.id, record])).values()]
    const ledgerMap = new Map(ledger.map((record) => [record.value.id, record]))
    const entryMap = new Map(entries.map((record) => [record.value.id, record]))
    const missing = items.filter(({ kind, id }) =>
      !(kind === "task" ? resolvedTaskRefs.has(id) : kind === "ledger" ? ledgerMap.has(id) : entryMap.has(id))
    )
    if (missing.length > 0) throw new ToolInputError(`Record(s) not found: ${missing.map(({ kind, id }) => `${kind}:${id}`).join(", ")}.`)

    const deletedTaskIdSet = new Set(tasks.map(({ value }) => value.id))
    const stoppedTimer = timer.value !== null && timer.value.taskId !== null && deletedTaskIdSet.has(timer.value.taskId)
    const deletedTaskIds = items.filter(({ kind }) => kind === "task").map(({ id }) => resolvedTaskRefs.get(id)!.value.id)
    const referencedTaskIds = entries.map(({ value }) => value.taskId).filter((id): id is string => id !== null)
    const relatedTasks = referencedTaskIds.length > 0 ? await ctx.data.tasks({ ids: [...new Set(referencedTaskIds)] }) : []
    const taskValues = new Map([...tasks, ...relatedTasks].map(({ value }) => [value.id, value]))
    const present = presentContext(ctx, projects)
    const changes: PlannedChange[] = []
    const deleted: Record<string, unknown>[] = []
    for (const item of items) {
      if (item.kind === "task") {
        const current = resolvedTaskRefs.get(item.id)!
        changes.push(deleteChange("task", current.value.id, current))
        deleted.push({ kind: item.kind, record: presentTask(current.value, present) })
      } else if (item.kind === "ledger") {
        const current = ledgerMap.get(item.id)!
        changes.push(deleteChange("ledger", item.id, current))
        deleted.push({ kind: item.kind, record: presentLedger(current.value, present) })
      } else {
        const current = entryMap.get(item.id)!
        changes.push(deleteChange("entry", item.id, current))
        deleted.push({ kind: item.kind, record: presentEntry(current.value, present, taskValues) })
      }
    }
    if (stoppedTimer) {
      const change = singletonChange("timer", timer, null)
      if (change) changes.push(change)
    }
    if (changes.length > MAX_CHANGES_PER_CALL) throw new ToolInputError(`This deletion would create ${changes.length} changes; the maximum is ${MAX_CHANGES_PER_CALL}.`)
    return {
      changes,
      reason: optionalReason(input),
      output: { deleted, stoppedTimer, deletedTaskIds },
    }
  },
}
