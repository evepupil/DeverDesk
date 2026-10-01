// 构造一条改动（PlannedChange）：写工具都从这里拿改动清单里的条目，
// beforeUpdatedAt、beforeRev 的规则见 docs/模块设计/AI改动记录.md（冲突检查用写入顺序号）。
import { SINGLETON_ID } from "../../../../src/sync/protocol"
import type { RecordKind } from "../../../../src/sync/protocol"
import type { PlannedChange, RecordVersion, SingletonVersion, Versioned } from "../../types"

/**
 * 新建一条记录。existing 是 DataSource.record() 查到的现状：
 * null（从没有过）→ 两个都为 null；已删除 → 给它删除时的修改时间和写入顺序号；
 * 没删除说明编号撞了，抛错（程序错误）。
 */
export function createChange(kind: RecordKind, id: string, after: unknown, existing?: RecordVersion | null): PlannedChange {
  if (existing && !existing.deleted) {
    throw new Error(`Cannot create ${kind} "${id}": a live record with this id already exists.`)
  }
  return {
    kind,
    id,
    action: "create",
    before: null,
    beforeUpdatedAt: existing ? existing.updatedAt : null,
    beforeRev: existing ? existing.rev : null,
    after,
  }
}

/** 改一条现有记录 */
export function updateChange<T>(kind: RecordKind, id: string, current: Versioned<T>, after: T): PlannedChange {
  return {
    kind,
    id,
    action: "update",
    before: current.value,
    beforeUpdatedAt: current.updatedAt,
    beforeRev: current.rev,
    after,
  }
}

/** 删一条现有记录 */
export function deleteChange<T>(kind: RecordKind, id: string, current: Versioned<T>): PlannedChange {
  return {
    kind,
    id,
    action: "delete",
    before: current.value,
    beforeUpdatedAt: current.updatedAt,
    beforeRev: current.rev,
    after: null,
  }
}

/**
 * 作息设置、计时器这类单例：根据现状和目标算出 create / update / delete；
 * 目标和现状一样（结构相等）返回 null，现状和目标都为 null 时也无改动。
 */
export function singletonChange<T>(
  kind: "profile" | "timer",
  current: SingletonVersion<T>,
  after: T | null
): PlannedChange | null {
  if (structurallyEqual(current.value, after)) return null
  if (current.value === null) return createChange(kind, SINGLETON_ID, after, singletonAsExisting(current))
  if (after === null) return deleteChange(kind, SINGLETON_ID, singletonAsCurrent(current))
  return updateChange(kind, SINGLETON_ID, singletonAsCurrent(current), after)
}

/** 单例从没有过时 updatedAt、rev 为 null；createChange 的 existing 形状里两者必须有值，这里兜底为 0 */
function singletonAsExisting<T>(current: SingletonVersion<T>): RecordVersion | null {
  if (current.updatedAt === null && current.rev === null) return null
  if (current.updatedAt === null || current.rev === null) {
    throw new Error("Singleton version must include both updatedAt and rev.")
  }
  return { value: null, updatedAt: current.updatedAt, rev: current.rev, deleted: true }
}

function singletonAsCurrent<T>(current: SingletonVersion<T>): Versioned<T> {
  return { value: current.value as T, updatedAt: current.updatedAt ?? 0, rev: current.rev ?? 0 }
}

/** 结构相等：JSON 值级别的深比较，键顺序无关 */
export function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => structurallyEqual(item, b[index]))
  }
  if (typeof a === "object") {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every((key) => key in right && structurallyEqual(left[key], right[key]))
  }
  return false
}
