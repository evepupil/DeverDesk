import type { OpContext } from "../../../../src/domain/operations/context"
import type { Project, Task } from "../../../../src/domain/types"
import type { PresentContext } from "../shared/present"
import type { ToolContext, Versioned, DataSource } from "../../types"
import { ToolInputError } from "../../types"
import { resolveTasks } from "../shared/refs"

export function inputObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ToolInputError(`Provide a valid ${label} object.`)
  }
  return value as Record<string, unknown>
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolInputError(`Field "${field}" must be a non-empty string.`)
  }
  return value
}

export function optionalReason(input: Record<string, unknown>): string | null {
  const reason = input.reason
  if (reason === undefined) return null
  if (typeof reason !== "string" || reason.length > 200) {
    throw new ToolInputError('Field "reason" must be a string of at most 200 characters.')
  }
  return reason
}

export function operationContext(ctx: ToolContext): OpContext {
  return { now: ctx.clock.now, today: ctx.clock.today, newId: ctx.newId }
}

export function presentContext(ctx: ToolContext, projects: readonly Versioned<Project>[]): PresentContext {
  return { clock: ctx.clock, projects: new Map(projects.map(({ value }) => [value.id, value])) }
}

export function assertUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw new ToolInputError(`Field "${field}" must not contain duplicate references.`)
  }
}

export function assertOnlyKeys(input: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unexpected = Object.keys(input).filter((key) => !allowed.includes(key))
  if (unexpected.length > 0) {
    throw new ToolInputError(`Unsupported field(s) for ${label}: ${unexpected.join(", ")}.`)
  }
}

export async function resolveTaskRefs(data: DataSource, refs: readonly string[]): Promise<Map<string, Versioned<Task>>> {
  const result = await resolveTasks(data, refs)
  const resolvedIds = refs.map((ref) => result.get(ref)!.value.id)
  if (new Set(resolvedIds).size !== resolvedIds.length) {
    throw new ToolInputError("Task references must identify different tasks.")
  }
  return result
}

