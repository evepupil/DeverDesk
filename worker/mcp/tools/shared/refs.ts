// 按编号或名称找记录：任务、副业、例行共用的引用规则。
// 规则见 docs/模块设计/MCP服务.md「共同约定」：完全相同 → 唯一开头 → 唯一包含，多了报歧义、找不到列现有。
import type { Project, Routine, Task } from "../../../../src/domain/types"
import { ToolInputError, type DataSource, type Versioned } from "../../types"

/** 「T-123」「t-123」→ 123；其余返回 null */
export function parseTaskCode(ref: string): number | null {
  const match = /^t-(\d+)$/i.exec(ref.trim())
  return match ? Number(match[1]) : null
}

/** 按内部编号或显示编号找一批任务（一次查询）；有找不到的就抛 ToolInputError，写明哪几个找不到 */
export async function resolveTasks(
  data: DataSource,
  refs: readonly string[]
): Promise<Map<string, Versioned<Task>>> {
  const result = new Map<string, Versioned<Task>>()
  if (refs.length === 0) return result

  const ids: string[] = []
  const seqs: number[] = []
  for (const ref of refs) {
    const normalized = ref.trim()
    if (normalized.length === 0) throw new ToolInputError("Task reference must not be empty.")
    const seq = parseTaskCode(normalized)
    if (seq === null) ids.push(normalized)
    else seqs.push(seq)
  }

  // 查询条件之间是「并且」、空数组表示「一个都不要」：内部编号和显示编号要分两次查，只查非空的那组
  const [byIdRows, bySeqRows] = await Promise.all([
    ids.length > 0 ? data.tasks({ ids }) : Promise.resolve([]),
    seqs.length > 0 ? data.tasks({ seqs }) : Promise.resolve([]),
  ])
  const found = [...new Map([...byIdRows, ...bySeqRows].map((task) => [task.value.id, task])).values()]
  const byId = new Map(found.map((task) => [task.value.id, task]))
  const bySeq = new Map<number, Versioned<Task>[]>()
  for (const task of found) bySeq.set(task.value.seq, [...(bySeq.get(task.value.seq) ?? []), task])

  const missing: string[] = []
  for (const ref of refs) {
    const normalized = ref.trim()
    const seq = parseTaskCode(normalized)
    const matches = seq === null ? [] : bySeq.get(seq) ?? []
    if (matches.length > 1) {
      const ids = matches.map((task) => task.value.id).sort()
      throw new ToolInputError(`Ambiguous task reference "${ref}": display code matches multiple tasks (${ids.join(", ")}). Use an internal id instead.`)
    }
    const match = seq === null ? byId.get(normalized) : matches[0]
    if (match) result.set(ref, match)
    else missing.push(ref)
  }

  if (missing.length > 0) {
    throw new ToolInputError(`Task(s) not found: ${missing.join(", ")}.`)
  }
  return result
}

/**
 * 副业引用：undefined → 没给（返回 undefined）；null → 不属于任何副业（返回 null）；
 * 字符串按「完全相同 → 唯一开头 → 唯一包含」找。所有副业都参与匹配，不按「已结束」过滤。
 */
export function resolveProject(
  ref: string | null | undefined,
  projects: readonly Versioned<Project>[]
): Versioned<Project> | null | undefined {
  if (ref === undefined) return undefined
  if (ref === null || ref.trim().length === 0) return null
  const match = matchByName(ref, projects, (project) => project.value.name, "project")
  if (match.kind === "found") return match.value
  throw new ToolInputError(match.message)
}

/** 例行引用：内部编号或标题，规则同副业（标题不分大小写） */
export function resolveRoutine(ref: string, routines: readonly Versioned<Routine>[]): Versioned<Routine> {
  if (ref.trim().length === 0) throw new ToolInputError("Routine reference must not be empty.")
  const match = matchByName(ref, routines, (routine) => routine.value.title, "routine")
  if (match.kind === "found") return match.value
  throw new ToolInputError(match.message)
}

type NameMatch<T> = { kind: "found"; value: Versioned<T> } | { kind: "not-found"; message: string }

/**
 * 引用匹配的统一骨架：内部编号完全相同 → 名称（例行用标题）不分大小写完全相同 →
 * 唯一的开头匹配 → 唯一的包含匹配。某一步匹配到多个报歧义，全都匹配不到报找不到。
 */
function matchByName<T extends { id: string }>(
  ref: string,
  records: readonly Versioned<T>[],
  nameOf: (record: Versioned<T>) => string,
  kindLabel: string
): NameMatch<T> {
  const exactId = records.find((record) => record.value.id === ref)
  if (exactId) return { kind: "found", value: exactId }

  const needle = ref.trim().toLowerCase()
  const named = records.map((record) => ({ record, name: nameOf(record) }))

  const byName = named.filter(({ name }) => name.toLowerCase() === needle)
  if (byName.length === 1) return { kind: "found", value: byName[0].record }
  if (byName.length > 1) return { kind: "not-found", message: ambiguous(kindLabel, ref, byName.map(({ name }) => name)) }

  const byPrefix = named.filter(({ name }) => name.toLowerCase().startsWith(needle))
  if (byPrefix.length === 1) return { kind: "found", value: byPrefix[0].record }
  if (byPrefix.length > 1) return { kind: "not-found", message: ambiguous(kindLabel, ref, byPrefix.map(({ name }) => name)) }

  const byInclusion = named.filter(({ name }) => name.toLowerCase().includes(needle))
  if (byInclusion.length === 1) return { kind: "found", value: byInclusion[0].record }
  if (byInclusion.length > 1) return { kind: "not-found", message: ambiguous(kindLabel, ref, byInclusion.map(({ name }) => name)) }

  return { kind: "not-found", message: notFound(kindLabel, ref, named.map(({ name }) => name)) }
}

function ambiguous(kindLabel: string, ref: string, candidates: string[]): string {
  return `Ambiguous ${kindLabel} reference "${ref}": matches multiple records (${candidates.join(", ")}). Use the exact name or the internal id instead.`
}

function notFound(kindLabel: string, ref: string, names: string[]): string {
  const known = names.length === 0 ? "none exist" : `existing: ${names.slice(0, 20).join(", ")}${names.length > 20 ? ", …" : ""}`
  return `${kindLabel[0].toUpperCase()}${kindLabel.slice(1)} not found: "${ref}" (${known}).`
}
