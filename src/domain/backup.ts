import type { WorkbenchData } from "./types"

/**
 * 备份文件：把全部数据存成一个 JSON 文件，换浏览器、换电脑或者以后搬到云端时导回来。
 * 导入前检查结构，文件不对就说清楚哪里不对，不动现有数据。
 */

export const BACKUP_FORMAT = "workbench-backup"
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: WorkbenchData
}

export function toBackup(data: WorkbenchData, now: number): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), data }
}

const LIST_KEYS = ["projects", "tasks", "entries", "ledger", "routines", "notes"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export type BackupResult = { ok: true; data: WorkbenchData } | { ok: false; error: string }

export function parseBackup(raw: string): BackupResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: "文件不是有效的 JSON" }
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) return { ok: false, error: "这不是工作台导出的备份文件" }
  if (parsed.version !== BACKUP_VERSION) return { ok: false, error: "备份文件的版本不认识" }
  const data = parsed.data
  if (!isRecord(data)) return { ok: false, error: "备份文件里没有数据" }
  for (const key of LIST_KEYS) {
    if (!Array.isArray(data[key])) return { ok: false, error: `备份文件缺少「${key}」` }
  }
  const profile = data.profile
  if (
    !isRecord(profile) ||
    typeof profile.name !== "string" ||
    typeof profile.weekdayMin !== "number" ||
    typeof profile.weekendMin !== "number" ||
    typeof profile.dayStartHour !== "number" ||
    typeof profile.dayEndHour !== "number"
  ) {
    return { ok: false, error: "备份文件里的作息设置不完整" }
  }
  return { ok: true, data: { ...(data as unknown as WorkbenchData), timer: null } }
}
