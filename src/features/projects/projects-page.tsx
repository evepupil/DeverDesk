"use client"

import { FolderPlus, Minimize2, Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { BoardColumn, CollapsedRow } from "@/components/base/board"
import { EmptyState } from "@/components/base/empty-state"
import { IconButton } from "@/components/base/icon-button"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { PROJECT_STAGE, PROJECT_STAGE_ENDED, PROJECT_STAGE_ORDER } from "@/data/catalog"
import { monthEnd, monthStart } from "@/domain/calendar"
import { formatAmount, formatHours } from "@/domain/format"
import { hourlyRate, minutesIn } from "@/domain/insights"
import { totals } from "@/domain/ledger"
import { summarizeProject, type ProjectSummary } from "@/domain/projects"
import type { ProjectStage } from "@/domain/types"
import { FilterBar, PageFrame } from "@/features/shell/page-frame"
import { useUrlState } from "@/state/url-state"
import { useToday, useWorkbenchData } from "@/state/hooks"
import { useUi } from "@/state/ui"
import { ProjectCard } from "./project-card"
import { ProjectSheet } from "./project-sheet"

interface StageGroup {
  stage: ProjectStage
  items: ProjectSummary[]
  collapsed: boolean
}

/**
 * 副业：按阶段排成看板，构思、搭建中、运营中三列展开，暂停和已结束收成短行（提炼）。
 * 点卡片在右侧打开详情；地址栏带 ?open= 时直接打开，侧栏的副业入口就是这样跳过来的。
 */
export function ProjectsPage() {
  const data = useWorkbenchData()
  const today = useToday()
  const openProjectForm = useUi((state) => state.openProjectForm)
  const { params, update } = useUrlState()
  const openId = params.get("open")
  const [toggled, setToggled] = useState<Set<ProjectStage>>(new Set())

  const groups = useMemo<StageGroup[]>(() => {
    const summaries = data.projects.map((project) => summarizeProject(data, project, today))
    return PROJECT_STAGE_ORDER.map((stage) => ({
      stage,
      items: summaries.filter((summary) => summary.project.stage === stage).sort((a, b) => b.month.net - a.month.net),
      collapsed: PROJECT_STAGE_ENDED.includes(stage),
    }))
  }, [data, today])

  const month = useMemo(() => {
    const period = { start: monthStart(today), end: monthEnd(today) }
    const money = totals(data.ledger, period.start, period.end)
    const minutes = minutesIn(data.entries, period)
    return { ...money, minutes, rate: hourlyRate(money.net, minutes) }
  }, [data.ledger, data.entries, today])

  const isCollapsed = (group: StageGroup) => group.collapsed !== toggled.has(group.stage)
  const flip = (stage: ProjectStage) =>
    setToggled((current) => {
      const next = new Set(current)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  const expanded = groups.filter((group) => !isCollapsed(group))
  const collapsed = groups.filter((group) => isCollapsed(group) && group.items.length > 0)
  const open = (id: string) => update({ open: id })

  const filterBar = (
    <FilterBar
      left={
        <span className="flex min-w-0 items-center gap-3 text-xs text-fg-2 tabular">
          <span>
            本月净收入 <span className="text-fg">{formatAmount(month.net)}</span>
          </span>
          <span>
            投入 <span className="text-fg">{formatHours(month.minutes)}</span>
          </span>
          {month.minutes > 0 && (
            <span className="hidden sm:inline">
              时薪 <span className="text-fg">{formatAmount(Math.round(month.rate))}</span>
            </span>
          )}
        </span>
      }
    />
  )

  return (
    <PageFrame
      title="副业"
      actions={
        <Button variant="outline" size="sm" onClick={() => openProjectForm(null)}>
          <Plus />
          新的副业
        </Button>
      }
      filterBar={filterBar}
      contentClassName={data.projects.length > 0 ? "overflow-hidden" : undefined}
    >
      {data.projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="还没有副业"
          className="h-full"
          action={
            <Button variant="outline" size="sm" onClick={() => openProjectForm(null)}>
              新的副业
            </Button>
          }
        />
      ) : (
        <div className="scroll-thin flex h-full min-h-0 items-start gap-(--gap-card) overflow-x-auto scroll-px-3 p-3 max-md:snap-x max-md:snap-mandatory">
          {expanded.map((group) => {
            const net = group.items.reduce((sum, item) => sum + item.month.net, 0)
            return (
              <BoardColumn
                key={group.stage}
                icon={<StatusIcon glyph={PROJECT_STAGE[group.stage].glyph} tone={PROJECT_STAGE[group.stage].tone} />}
                title={PROJECT_STAGE[group.stage].label}
                count={group.items.length}
                meta={net !== 0 ? `本月 ${formatAmount(net)}` : undefined}
                className="max-h-full w-[300px] shrink-0 snap-start xl:w-auto xl:max-w-[400px] xl:min-w-[260px] xl:flex-1"
                bodyClassName="scroll-thin overflow-y-auto"
                actions={
                  <>
                    <IconButton label="新的副业" size="icon-xs" onClick={() => openProjectForm(null)}>
                      <Plus />
                    </IconButton>
                    <IconButton label="收起这一列" size="icon-xs" onClick={() => flip(group.stage)}>
                      <Minimize2 />
                    </IconButton>
                  </>
                }
              >
                {group.items.length === 0 ? (
                  <p className="px-2 pb-2 text-sm text-fg-2">没有副业</p>
                ) : (
                  group.items.map((summary) => (
                    <ProjectCard key={summary.project.id} summary={summary} today={today} onOpen={() => open(summary.project.id)} />
                  ))
                )}
              </BoardColumn>
            )
          })}
          {collapsed.length > 0 && (
            <div className="flex w-[240px] shrink-0 snap-start flex-col gap-px rounded-lg bg-column p-1 xl:w-auto xl:max-w-[320px] xl:min-w-[200px] xl:flex-1">
              {collapsed.map((group) => (
                <CollapsedRow
                  key={group.stage}
                  icon={<StatusIcon glyph={PROJECT_STAGE[group.stage].glyph} tone={PROJECT_STAGE[group.stage].tone} />}
                  label={PROJECT_STAGE[group.stage].label}
                  count={group.items.length}
                  onClick={() => flip(group.stage)}
                  aria-label={`展开「${PROJECT_STAGE[group.stage].label}」，${group.items.length} 个副业`}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <ProjectSheet projectId={openId} onClose={() => update({ open: null })} />
    </PageFrame>
  )
}
