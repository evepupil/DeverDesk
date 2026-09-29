import { formatAmount, formatHours } from "@/domain/format"
import type { InsightMetric, InsightRange } from "@/domain/insights"

/** 概览四个指标的名称、数值写法和图表类型 */

export interface InsightMeta {
  id: InsightMetric
  label: string
  format(value: number): string
  axis(value: number): string
  chart: "area" | "bar"
}

function compactAmount(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "−" : ""
  if (abs >= 10000) return `${sign}¥${Number((abs / 10000).toFixed(1))}万`
  if (abs >= 1000) return `${sign}¥${Number((abs / 1000).toFixed(1))}k`
  return `${sign}¥${Math.round(abs)}`
}

export const INSIGHTS: InsightMeta[] = [
  { id: "net", label: "净收入", format: (value) => formatAmount(Math.round(value)), axis: compactAmount, chart: "bar" },
  { id: "hours", label: "投入时间", format: formatHours, axis: (value) => `${Math.round(value / 60)}h`, chart: "area" },
  { id: "rate", label: "时薪", format: (value) => `${formatAmount(Math.round(value))}/h`, axis: compactAmount, chart: "area" },
  { id: "done", label: "完成任务", format: (value) => `${Math.round(value)} 件`, axis: (value) => String(Math.round(value)), chart: "bar" },
]

export const INSIGHT_RANGES: { value: InsightRange; label: string }[] = [
  { value: "4w", label: "4 周" },
  { value: "12w", label: "12 周" },
  { value: "12m", label: "12 个月" },
]

export const RANGE_TEXT: Record<InsightRange, string> = {
  "4w": "最近 4 周 · 按周",
  "12w": "最近 12 周 · 按周",
  "12m": "最近 12 个月 · 按月",
}
