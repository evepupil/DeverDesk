"use client"

import { cn } from "cn"
import { useMemo, useState } from "react"
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Delta } from "@/components/base/delta"
import { computeInsight, type InsightMetric, type InsightRange, type InsightResult, type InsightSeriesPoint } from "@/domain/insights"
import type { DayKey, WorkbenchData } from "@/domain/types"
import { focusRingInset } from "@/lib/styles"
import { useT } from "@/i18n/react"
import { insightMetas, rangeText, type InsightMeta } from "./insight-meta"

/**
 * 主图卡：四个指标做成图表的切换页签，不单独做统计卡（提炼）。
 * 对比线是上一个同样长的时间段，浅灰虚线。
 */

function MetricTab({
  meta,
  result,
  selected,
  index,
  onSelect,
}: {
  meta: InsightMeta
  result: InsightResult
  selected: boolean
  index: number
  onSelect(): void
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`insight-tab-${meta.id}`}
      aria-selected={selected}
      aria-controls="insight-panel"
      onClick={onSelect}
      className={cn(
        "relative flex min-w-0 flex-col items-stretch gap-1 border-b border-line px-3 pt-2.5 pb-2 text-left transition-colors duration-(--dur-fast)",
        focusRingInset,
        index % 2 === 0 && "border-r",
        index === 1 && "sm:border-r",
        index === 2 && "sm:border-r",
        selected ? "bg-card sm:border-b-transparent" : "bg-raised hover:bg-[#f4f4f5]"
      )}
    >
      <span
        aria-hidden
        className={cn("absolute top-3 left-0 h-3 w-0.5 rounded-r-full transition-colors", selected ? "bg-ink" : "bg-transparent")}
      />
      <span className="flex min-w-0 items-center justify-between gap-2 text-xs text-fg-2">
        <span className="truncate">{meta.label}</span>
        <Delta value={result.change} className="shrink-0" />
      </span>
      <span className="truncate text-xl font-medium text-fg tabular">{meta.format(result.value)}</span>
    </button>
  )
}

function TrendTooltip({
  active,
  payload,
  meta,
  compare,
}: {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
  meta: InsightMeta
  compare: boolean
}) {
  const t = useT().insights
  const point = payload?.[0]?.payload as InsightSeriesPoint | undefined
  if (!active || !point) return null
  return (
    <div className="min-w-40 rounded-lg border border-line bg-card px-2.5 py-2 text-xs shadow-md">
      <div className="pb-1.5 text-fg-2">{point.title}</div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-ink" />
        <span className="text-fg-2">{t.current}</span>
        <span className="ml-auto pl-4 font-medium text-fg tabular">{meta.format(point.value)}</span>
      </div>
      {compare && point.compare !== null && (
        <div className="mt-1 flex items-center gap-2">
          <span aria-hidden className="w-3 border-t border-dashed border-(--chart-compare)" />
          <span className="text-fg-2">{t.previous}</span>
          <span className="ml-auto pl-4 text-fg-2 tabular">{meta.format(point.compare)}</span>
        </div>
      )}
    </div>
  )
}

/** 纵轴标签要占多宽：按数据里最长的标签估算（12px 字号每个字约 7px）；英文金额带币种前缀（CN¥3.5K），比中文宽 */
function axisWidth(meta: InsightMeta, result: InsightResult): number {
  let peak = 0
  let negative = false
  for (const point of result.series) {
    for (const value of [point.value, point.compare ?? 0]) {
      peak = Math.max(peak, Math.abs(value))
      if (value < 0) negative = true
    }
  }
  const longest = meta.axis(negative ? -peak : peak)
  return Math.min(96, Math.max(40, longest.length * 7 + 8))
}

function TrendChart({ meta, result, compare }: { meta: InsightMeta; result: InsightResult; compare: boolean }) {
  const axisTick = { fontSize: 12, fill: "var(--text-secondary)" }
  return (
    <div className="h-[200px] w-full sm:h-[232px]">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 232 }}>
        <ComposedChart data={result.series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="insight-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-ink)" stopOpacity={0.1} />
              <stop offset="100%" stopColor="var(--chart-ink)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tick={axisTick} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={axisWidth(meta, result)}
            tickMargin={4}
            tickCount={4}
            tick={axisTick}
            tickFormatter={meta.axis}
            domain={meta.chart === "bar" ? ["auto", "auto"] : [0, "auto"]}
          />
          <Tooltip
            cursor={meta.chart === "bar" ? { fill: "var(--state-hover)" } : { stroke: "var(--line-strong)" }}
            content={(props) => <TrendTooltip {...props} meta={meta} compare={compare} />}
          />
          {meta.chart === "bar" ? (
            <>
              <ReferenceLine y={0} stroke="var(--line-strong)" />
              {compare && (
                <Line
                  type="linear"
                  dataKey="compare"
                  stroke="var(--chart-compare)"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              <Bar dataKey="value" radius={[2, 2, 2, 2]} maxBarSize={28} isAnimationActive={false}>
                {result.series.map((point, index) => (
                  <Cell
                    key={index}
                    fill={point.value >= 0 ? "var(--chart-ink)" : "var(--chart-negative)"}
                    fillOpacity={index === result.series.length - 1 ? 0.55 : 1}
                  />
                ))}
              </Bar>
            </>
          ) : (
            <>
              {compare && (
                <Line
                  type="monotone"
                  dataKey="compare"
                  stroke="var(--chart-compare)"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--chart-ink)"
                strokeWidth={1.5}
                fill="url(#insight-fill)"
                dot={false}
                activeDot={{ r: 3, fill: "var(--chart-ink)", stroke: "#fff", strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function InsightChart({
  data,
  range,
  compare,
  today,
}: {
  data: WorkbenchData
  range: InsightRange
  compare: boolean
  today: DayKey
}) {
  const [selected, setSelected] = useState<InsightMetric>("net")
  const t = useT().insights
  // 词条对象随语言整体更换，用它作依赖让指标名跟着语言重算
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上，词条对象按引用更换
  const metas = useMemo(() => insightMetas(), [t])
  const results = useMemo(() => metas.map((meta) => computeInsight(meta.id, data, range, today)), [metas, data, range, today])
  const index = metas.findIndex((meta) => meta.id === selected)
  const meta = metas[index]
  const result = results[index]

  return (
    <section aria-label={t.metricsLabel} className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div role="tablist" aria-label={t.metricsLabel} className="grid grid-cols-2 sm:grid-cols-4">
        {metas.map((item, i) => (
          <MetricTab
            key={item.id}
            meta={item}
            result={results[i]}
            index={i}
            selected={item.id === selected}
            onSelect={() => setSelected(item.id)}
          />
        ))}
      </div>
      <div role="tabpanel" id="insight-panel" aria-labelledby={`insight-tab-${meta.id}`} className="px-3 pt-3 pb-2">
        <div className="flex h-5 items-center gap-3 pb-1 text-xs text-fg-2">
          <span>
            {rangeText()[range]}
            {meta.id === "rate" && t.rateFormula}
          </span>
          {compare && (
            <span className="ml-auto flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-3 rounded-full bg-ink" />
                {t.current}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="w-3 border-t border-dashed border-(--chart-compare)" />
                {t.previous}
              </span>
            </span>
          )}
        </div>
        <TrendChart meta={meta} result={result} compare={compare} />
      </div>
    </section>
  )
}
