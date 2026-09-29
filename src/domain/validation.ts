import { getT } from "../i18n/runtime"
import { parseAmount } from "./ledger"
import type { EntryKind, EntryStatus } from "./types"

/** 表单校验：返回每个字段的错误提示，没有错误就是空对象 */

export const TASK_TITLE_MAX = 80
export const NAME_MAX = 20

export function validateTitle(title: string, label?: string, max = TASK_TITLE_MAX): string | undefined {
  const text = title.trim()
  const name = label ?? getT().forms.validation.title
  if (!text) return getT().forms.validation.required(name)
  if (text.length > max) return getT().forms.validation.tooLong(name, max)
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
  const t = getT().forms.validation
  if (parseAmount(draft.amount) === null) errors.amount = t.amount
  if (!draft.date) errors.date = t.date
  if (draft.kind === "income" && draft.status === "pending" && !draft.expectedOn) {
    errors.expectedOn = t.expectedOn
  }
  return errors
}

export function parseTarget(raw: string): number | null | undefined {
  const text = raw.trim()
  if (!text) return null
  const value = parseAmount(text)
  return value === null ? undefined : value
}
