import { parseAmount } from "./ledger"
import type { EntryKind, EntryStatus } from "./types"

/** 表单校验：返回每个字段的错误提示，没有错误就是空对象 */

export const TASK_TITLE_MAX = 80
export const NAME_MAX = 20

export function validateTitle(title: string, label = "任务名称", max = TASK_TITLE_MAX): string | undefined {
  const text = title.trim()
  if (!text) return `请填写${label}`
  if (text.length > max) return `${label}最多 ${max} 个字`
  return undefined
}

export interface EntryDraft {
  kind: EntryKind
  amount: string
  date: string
  status: EntryStatus
  expectedOn: string
}

export function validateEntry(draft: EntryDraft): Partial<Record<"amount" | "date" | "expectedOn", string>> {
  const errors: Partial<Record<"amount" | "date" | "expectedOn", string>> = {}
  if (parseAmount(draft.amount) === null) errors.amount = "请填写大于 0 的金额，最多两位小数"
  if (!draft.date) errors.date = "请选择日期"
  if (draft.kind === "income" && draft.status === "pending" && !draft.expectedOn) {
    errors.expectedOn = "请填写预计到账日期"
  }
  return errors
}

export function parseTarget(raw: string): number | null | undefined {
  const text = raw.trim()
  if (!text) return null
  const value = parseAmount(text)
  return value === null ? undefined : value
}
