"use client"

import { useMemo } from "react"

import { Segmented } from "@/components/base/segmented"
import { byCategory } from "@/domain/ledger"
import { estimateAccuracy, minutesByWeekday, projectStats, rangePeriods } from "@/domain/insights"
import { DisplayPopover, DisplayRow, DisplaySwitch } from "@/features/shell/display-controls"
import { FilterBar, PageFrame } from "@/features/shell/page-frame"
import { useT } from "@/i18n/react"
import { useProjectsById, useToday, useWorkbenchData } from "@/state/hooks"
import { DEFAULT_PREFS, usePrefs } from "@/state/prefs"
import { MoneyBreakdown, ProjectsBreakdown, TimeBreakdown } from "./breakdown"
import { insightRanges } from "./insight-meta"
import { InsightChart } from "./insight-chart"
import { ActivityColumn, EndedColumn } from "./period-column"

/**
 * 概览：主图卡横跨左侧三列，下面三列等宽不等高（副业 / 钱 / 时间）；
 * 最右一列放本期结束的短行和动态。所有数字都从同一份记录现算。
 */
export function InsightsPage() {
  const t = useT()
  const data = useWorkbenchData()
  const today = useToday()
  const projectsById = useProjectsById()
  const prefs = usePrefs((state) => state.insights)
  const setPrefs = usePrefs((state) => state.set)

  const period = useMemo(() => rangePeriods(prefs.range, today).current, [prefs.range, today])
  const stats = useMemo(() => projectStats(data, period), [data, period])
  const income = useMemo(() => byCategory(data.ledger, "income", period.start, period.end), [data.ledger, period])
  const expense = useMemo(() => byCategory(data.ledger, "expense", period.start, period.end), [data.ledger, period])
  const accuracy = useMemo(() => estimateAccuracy(data.tasks, data.entries, period), [data.tasks, data.entries, period])
  const weekdays = useMemo(() => minutesByWeekday(data.entries, period), [data.entries, period])

  const filterBar = (
    <FilterBar
      left={<Segmented label={t.insights.range} value={prefs.range} options={insightRanges()} onChange={(range) => setPrefs("insights", { range })} />}
      right={
        <DisplayPopover onReset={() => setPrefs("insights", DEFAULT_PREFS.insights)}>
          <DisplayRow id="insights-compare" label={t.insights.compare}>
            <DisplaySwitch id="insights-compare" checked={prefs.compare} onChange={(compare) => setPrefs("insights", { compare })} />
          </DisplayRow>
        </DisplayPopover>
      }
    />
  )

  return (
    <PageFrame title={t.nav.pages.insights} filterBar={filterBar}>
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-3">
          <InsightChart data={data} range={prefs.range} compare={prefs.compare} today={today} />
          <div className="grid items-start gap-(--gap-card) md:grid-cols-2 lg:grid-cols-3">
            <ProjectsBreakdown stats={stats} projectsById={projectsById} />
            <MoneyBreakdown income={income} expense={expense} />
            <TimeBreakdown stats={stats} projectsById={projectsById} accuracy={accuracy} weekdays={weekdays} />
          </div>
        </div>
        <div className="grid min-w-0 content-start gap-(--gap-card) md:grid-cols-2 xl:grid-cols-1">
          <EndedColumn data={data} period={period} />
          <ActivityColumn data={data} period={period} />
        </div>
      </div>
    </PageFrame>
  )
}
