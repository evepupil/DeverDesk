import type {
  Cadence,
  Channel,
  EntryStatus,
  ExpenseCategory,
  IncomeCategory,
  Priority,
  ProjectStage,
  TaskStatus,
} from "@/domain/types"
import { getT } from "@/i18n/runtime"

/**
 * 状态图形和选项。叫法在词条里（i18n/messages 的 catalog），这里的 label 是按当前语言取词条的读取器，
 * 所以各处照旧写 TASK_STATUS[status].label。
 */

/** 状态图形：空心圈、虚线圈、半圈（进行中）、实心勾（已结束）、叉、感叹号、中心点、减号 */
export type StatusGlyph = "ring" | "dashed" | "half" | "check" | "cross" | "alert" | "dot" | "minus"

export type GlyphTone = "progress" | "done" | "risk" | "idle" | "neutral"

export interface StatusMeta {
  readonly label: string
  glyph: StatusGlyph
  tone: GlyphTone
}

/** 叫法按当前语言现取的状态 */
function status(label: () => string, glyph: StatusGlyph, tone: GlyphTone): StatusMeta {
  return {
    get label() {
      return label()
    },
    glyph,
    tone,
  }
}

/** 只有叫法的选项 */
function named(label: () => string): { readonly label: string } {
  return {
    get label() {
      return label()
    },
  }
}

export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  backlog: status(() => getT().catalog.taskStatus.backlog, "dashed", "idle"),
  todo: status(() => getT().catalog.taskStatus.todo, "ring", "neutral"),
  doing: status(() => getT().catalog.taskStatus.doing, "half", "progress"),
  done: status(() => getT().catalog.taskStatus.done, "check", "done"),
  dropped: status(() => getT().catalog.taskStatus.dropped, "cross", "idle"),
}
export const TASK_STATUS_ORDER: TaskStatus[] = ["backlog", "todo", "doing", "done", "dropped"]
/** 看板里默认收成短行的状态（已结束一类） */
export const TASK_STATUS_ENDED: TaskStatus[] = ["done", "dropped"]

function priority(level: Priority): { readonly label: string; readonly short: string } {
  return {
    get label() {
      return getT().catalog.priority[level]
    },
    get short() {
      return getT().catalog.priorityShort[level]
    },
  }
}

export const PRIORITY: Record<Priority, { readonly label: string; readonly short: string }> = {
  0: priority(0),
  1: priority(1),
  2: priority(2),
  3: priority(3),
  4: priority(4),
}
export const PRIORITY_ORDER: Priority[] = [4, 3, 2, 1, 0]

export const PROJECT_STAGE: Record<ProjectStage, StatusMeta> = {
  idea: status(() => getT().catalog.projectStage.idea, "dashed", "idle"),
  building: status(() => getT().catalog.projectStage.building, "half", "progress"),
  running: status(() => getT().catalog.projectStage.running, "dot", "neutral"),
  paused: status(() => getT().catalog.projectStage.paused, "minus", "idle"),
  ended: status(() => getT().catalog.projectStage.ended, "check", "done"),
}
export const PROJECT_STAGE_ORDER: ProjectStage[] = ["idea", "building", "running", "paused", "ended"]
export const PROJECT_STAGE_ENDED: ProjectStage[] = ["paused", "ended"]

function cadence(key: Cadence): { readonly label: string; readonly period: string } {
  return {
    get label() {
      return getT().catalog.cadence[key]
    },
    get period() {
      return getT().catalog.cadencePeriod[key]
    },
  }
}

export const CADENCE: Record<Cadence, { readonly label: string; readonly period: string }> = {
  daily: cadence("daily"),
  weekdays: cadence("weekdays"),
  weekly: cadence("weekly"),
  monthly: cadence("monthly"),
}
export const CADENCE_ORDER: Cadence[] = ["daily", "weekdays", "weekly", "monthly"]

export const CHANNELS: Record<Channel, { readonly label: string }> = {
  alipay: named(() => getT().catalog.channel.alipay),
  wechat: named(() => getT().catalog.channel.wechat),
  bank: named(() => getT().catalog.channel.bank),
  platform: named(() => getT().catalog.channel.platform),
  card: named(() => getT().catalog.channel.card),
}
export const CHANNEL_ORDER: Channel[] = ["platform", "alipay", "wechat", "bank", "card"]

export const INCOME_CATEGORIES: Record<IncomeCategory, { readonly label: string }> = {
  sales: named(() => getT().catalog.income.sales),
  subscription: named(() => getT().catalog.income.subscription),
  sponsor: named(() => getT().catalog.income.sponsor),
  consulting: named(() => getT().catalog.income.consulting),
  ads: named(() => getT().catalog.income.ads),
  "other-income": named(() => getT().catalog.income["other-income"]),
}
export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { readonly label: string }> = {
  server: named(() => getT().catalog.expense.server),
  domain: named(() => getT().catalog.expense.domain),
  ai: named(() => getT().catalog.expense.ai),
  tools: named(() => getT().catalog.expense.tools),
  design: named(() => getT().catalog.expense.design),
  marketing: named(() => getT().catalog.expense.marketing),
  "other-expense": named(() => getT().catalog.expense["other-expense"]),
}
export const INCOME_CATEGORY_ORDER = Object.keys(INCOME_CATEGORIES) as IncomeCategory[]
export const EXPENSE_CATEGORY_ORDER = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]

export function categoryLabel(category: string): string {
  return (
    INCOME_CATEGORIES[category as IncomeCategory]?.label ??
    EXPENSE_CATEGORIES[category as ExpenseCategory]?.label ??
    category
  )
}

export const ENTRY_STATUS: Record<EntryStatus, StatusMeta> = {
  pending: status(() => getT().catalog.entryStatus.pending, "half", "progress"),
  received: status(() => getT().catalog.entryStatus.received, "check", "done"),
  refunded: status(() => getT().catalog.entryStatus.refunded, "minus", "idle"),
}

/** 可选的记账币种（ISO 4217 代码），名字在词条的 catalog.currency */
export const CURRENCIES = ["CNY", "USD", "EUR", "GBP", "JPY", "HKD", "TWD", "SGD", "CAD", "AUD"] as const

export type Currency = (typeof CURRENCIES)[number]

export function currencyLabel(code: string): string {
  const names = getT().catalog.currency as Record<string, string>
  return names[code] ?? code
}

/** 估时的常用档位 */
export const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240]
