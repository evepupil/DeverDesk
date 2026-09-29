import { getT } from "@/i18n/runtime"
import { formatAmount, formatAmountCompact, formatHours } from "@/domain/format"
import type { InsightMetric, InsightRange } from "@/domain/insights"

/** 概览四个指标的名称、数值写法和图表类型 */

export interface InsightMeta {
  id: InsightMetric
  label: string
  format(value: number): string
  axis(value: number): string
  chart: "area" | "bar"
}

/** 指标名称和写法按当前语言取，语言切换后整个工作台重画 */
export function insightMetas(): InsightMeta[] {
  const t = getT().insights
  return [
    { id: "net", label: t.metrics.net, format: (value) => formatAmount(Math.round(value)), axis: formatAmountCompact, chart: "bar" },
    { id: "hours", label: t.metrics.hours, format: formatHours, axis: (value) => `${Math.round(value / 60)}h`, chart: "area" },
    { id: "rate", label: t.metrics.rate, format: (value) => `${formatAmount(Math.round(value))}/h`, axis: formatAmountCompact, chart: "area" },
    { id: "done", label: t.metrics.done, format: (value) => t.doneCount(Math.round(value)), axis: (value) => String(Math.round(value)), chart: "bar" },
  ]
}

export function insightRanges(): { value: InsightRange; label: string }[] {
  const t = getT().insights.ranges
  return [
    { value: "4w", label: t["4w"] },
    { value: "12w", label: t["12w"] },
    { value: "12m", label: t["12m"] },
  ]
}

export function rangeText(): Record<InsightRange, string> {
  return getT().insights.rangeText
}
