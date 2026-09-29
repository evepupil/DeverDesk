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

/** 名称、状态图形和选项。换文案、换叫法只改这里 */

/** 状态图形：空心圈、虚线圈、半圈（进行中）、实心勾（已结束）、叉、感叹号、中心点、减号 */
export type StatusGlyph = "ring" | "dashed" | "half" | "check" | "cross" | "alert" | "dot" | "minus"

export type GlyphTone = "progress" | "done" | "risk" | "idle" | "neutral"

export interface StatusMeta {
  label: string
  glyph: StatusGlyph
  tone: GlyphTone
}

export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  backlog: { label: "想法", glyph: "dashed", tone: "idle" },
  todo: { label: "待办", glyph: "ring", tone: "neutral" },
  doing: { label: "进行中", glyph: "half", tone: "progress" },
  done: { label: "已完成", glyph: "check", tone: "done" },
  dropped: { label: "已搁置", glyph: "cross", tone: "idle" },
}
export const TASK_STATUS_ORDER: TaskStatus[] = ["backlog", "todo", "doing", "done", "dropped"]
/** 看板里默认收成短行的状态（已结束一类） */
export const TASK_STATUS_ENDED: TaskStatus[] = ["done", "dropped"]

export const PRIORITY: Record<Priority, { label: string; short: string }> = {
  0: { label: "无优先级", short: "无" },
  1: { label: "低", short: "低" },
  2: { label: "中", short: "中" },
  3: { label: "高", short: "高" },
  4: { label: "紧急", short: "紧急" },
}
export const PRIORITY_ORDER: Priority[] = [4, 3, 2, 1, 0]

export const PROJECT_STAGE: Record<ProjectStage, StatusMeta> = {
  idea: { label: "构思", glyph: "dashed", tone: "idle" },
  building: { label: "搭建中", glyph: "half", tone: "progress" },
  running: { label: "运营中", glyph: "dot", tone: "neutral" },
  paused: { label: "暂停", glyph: "minus", tone: "idle" },
  ended: { label: "已结束", glyph: "check", tone: "done" },
}
export const PROJECT_STAGE_ORDER: ProjectStage[] = ["idea", "building", "running", "paused", "ended"]
export const PROJECT_STAGE_ENDED: ProjectStage[] = ["paused", "ended"]

export const CADENCE: Record<Cadence, { label: string; period: string }> = {
  daily: { label: "每天", period: "今天" },
  weekdays: { label: "工作日", period: "今天" },
  weekly: { label: "每周", period: "本周" },
  monthly: { label: "每月", period: "本月" },
}
export const CADENCE_ORDER: Cadence[] = ["daily", "weekdays", "weekly", "monthly"]

export const CHANNELS: Record<Channel, { label: string }> = {
  alipay: { label: "支付宝" },
  wechat: { label: "微信" },
  bank: { label: "银行转账" },
  platform: { label: "平台结算" },
  card: { label: "信用卡" },
}
export const CHANNEL_ORDER: Channel[] = ["platform", "alipay", "wechat", "bank", "card"]

export const INCOME_CATEGORIES: Record<IncomeCategory, { label: string }> = {
  sales: { label: "销售" },
  subscription: { label: "订阅" },
  sponsor: { label: "赞助" },
  consulting: { label: "咨询" },
  ads: { label: "广告" },
  "other-income": { label: "其他收入" },
}
export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string }> = {
  server: { label: "服务器" },
  domain: { label: "域名" },
  ai: { label: "模型接口" },
  tools: { label: "工具订阅" },
  design: { label: "设计素材" },
  marketing: { label: "推广" },
  "other-expense": { label: "其他支出" },
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
  pending: { label: "待到账", glyph: "half", tone: "progress" },
  received: { label: "已到账", glyph: "check", tone: "done" },
  refunded: { label: "已退款", glyph: "minus", tone: "idle" },
}

/** 估时的常用档位 */
export const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240]
