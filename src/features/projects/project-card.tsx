"use client"

import { cn } from "cn"
import { Flag } from "lucide-react"

import { LabelChip } from "@/components/base/label-chip"
import { ProjectMark } from "@/components/base/marks"
import { diffDays } from "@/domain/calendar"
import { formatAmount, formatHours } from "@/domain/format"
import type { ProjectSummary } from "@/domain/projects"
import type { DayKey } from "@/domain/types"
import { focusRing } from "@/lib/styles"
import { MiniBars } from "../common/bars"

export function milestoneWhen(due: DayKey, today: DayKey): { text: string; late: boolean } {
  const left = diffDays(due, today)
  if (left < 0) return { text: `已过 ${-left} 天`, late: true }
  if (left === 0) return { text: "今天", late: false }
  return { text: `${left} 天后`, late: false }
}

/**
 * 副业卡片三层（提炼）：本月赚了多少、花了多少时间和最近 12 周走势；名称；目标进度、下个里程碑、待办数。
 */
export function ProjectCard({ summary, today, onOpen }: { summary: ProjectSummary; today: DayKey; onOpen(): void }) {
  const { project, month } = summary
  const target = project.monthlyTarget
  const reached = target ? Math.round((Math.max(0, month.net) / target) * 100) : null
  const milestone = summary.nextMilestone
  const when = milestone ? milestoneWhen(milestone.due, today) : null

  return (
    <div
      onClick={onOpen}
      className="group flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left shadow-sm transition-[border-color] duration-(--dur-fast) hover:border-line-3"
    >
      <div className="flex h-[18px] min-w-0 items-center gap-2 text-xs text-fg-2">
        <span className={cn("tabular", month.net < 0 && "text-bad")}>本月 {formatAmount(month.net)}</span>
        {month.minutes > 0 && <span className="tabular">{formatHours(month.minutes)}</span>}
        {month.minutes > 0 && month.net !== 0 && <span className="hidden tabular sm:inline">{formatAmount(Math.round(month.rate))}/h</span>}
        <MiniBars values={summary.weeks.map((week) => week.net)} className="ml-auto" />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <ProjectMark name={project.name} color={project.color} size={18} />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
          title={project.goal}
          className={cn("min-w-0 truncate text-left text-sm font-medium", focusRing)}
        >
          {project.name}
        </button>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {reached !== null && (
          <LabelChip
            className="gap-1.5"
            title={`本月目标 ${formatAmount(target ?? 0)}`}
            icon={
              <span aria-hidden className="relative inline-block h-1 w-8 shrink-0 overflow-hidden rounded-full bg-pressed">
                <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${Math.min(100, reached)}%` }} />
              </span>
            }
          >
            目标 {reached}%
          </LabelChip>
        )}
        {milestone && when && (
          <LabelChip
            icon={<Flag className="size-3 text-fg-3" aria-hidden />}
            color={when.late ? "red" : undefined}
            className="gap-1 pl-1"
            title={milestone.title}
          >
            {milestone.title} · {when.text}
          </LabelChip>
        )}
        {summary.openTasks > 0 && <LabelChip>{summary.openTasks} 件待办</LabelChip>}
      </div>
    </div>
  )
}
