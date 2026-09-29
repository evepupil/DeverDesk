"use client"

import { cn } from "cn"
import { ArrowDownLeft, ArrowUpRight, Flag, Inbox, Undo2 } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { BoardColumn, CollapsedRow, Surface } from "@/components/base/board"
import { EmptyState } from "@/components/base/empty-state"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { deriveEvents, type EventKind } from "@/domain/activity"
import { dayKeyOf, dayStartMs, addDays, formatAgo, formatMonthDay } from "@/domain/calendar"
import { formatAmount } from "@/domain/format"
import { doneIn, type Period } from "@/domain/insights"
import type { WorkbenchData } from "@/domain/types"
import { useT } from "@/i18n/react"
import { focusRingInset } from "@/lib/styles"
import { useNow, useProjectsById } from "@/state/hooks"
import { useUi } from "@/state/ui"

const LIMIT = 12

/** 动态事件类型的叫法，按当前语言取 */
function eventText(kind: EventKind, t: ReturnType<typeof useT>["insights"]): string {
  if (kind === "done") return t.eventDone
  if (kind === "income") return t.eventIncome
  if (kind === "expense") return t.eventExpense
  if (kind === "refund") return t.eventRefund
  return t.eventMilestone
}

function EventGlyph({ kind }: { kind: EventKind }) {
  const box = "flex size-3.5 shrink-0 items-center justify-center"
  if (kind === "done") return <StatusIcon glyph="check" tone="done" />
  if (kind === "income") return <span className={box}><ArrowDownLeft className="size-3.5 text-good" aria-hidden /></span>
  if (kind === "expense") return <span className={box}><ArrowUpRight className="size-3.5 text-fg-2" aria-hidden /></span>
  if (kind === "refund") return <span className={box}><Undo2 className="size-3.5 text-fg-2" aria-hidden /></span>
  return <span className={box}><Flag className="size-3.5 text-fg-2" aria-hidden /></span>
}

interface EndedRow {
  key: string
  icon: ReactNode
  label: string
  count: number
  amount?: string
  items: { id: string; title: string; meta: string; projectId: string | null; onSelect?: () => void }[]
}

/** 本期结束的事收成短行（提炼）：做完的任务、达成的里程碑、退掉的钱；点开看名单 */
export function EndedColumn({ data, period }: { data: WorkbenchData; period: Period }) {
  const t = useT().insights
  const openTask = useUi((state) => state.openTask)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const projectsById = useProjectsById()

  const rows = useMemo<EndedRow[]>(() => {
    const done = doneIn(data.tasks, period).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    const milestones = data.projects.flatMap((project) =>
      project.milestones
        .filter((milestone) => milestone.doneOn && milestone.doneOn >= period.start && milestone.doneOn <= period.end)
        .map((milestone) => ({ milestone, project }))
    )
    const refunds = data.ledger.filter((entry) => entry.status === "refunded" && entry.date >= period.start && entry.date <= period.end)
    return [
      {
        key: "done",
        icon: <StatusIcon glyph="check" tone="done" />,
        label: t.endedDone,
        count: done.length,
        items: done.map((task) => ({
          id: task.id,
          title: task.title,
          meta: formatMonthDay(dayKeyOf(new Date(task.completedAt ?? 0))),
          projectId: task.projectId,
          onSelect: () => openTask(task.id),
        })),
      },
      {
        key: "milestones",
        icon: <span className="flex size-3.5 items-center justify-center"><Flag className="size-3.5 text-fg-2" aria-hidden /></span>,
        label: t.endedMilestones,
        count: milestones.length,
        items: milestones.map(({ milestone, project }) => ({
          id: milestone.id,
          title: milestone.title,
          meta: formatMonthDay(milestone.doneOn ?? period.end),
          projectId: project.id,
        })),
      },
      {
        key: "refunds",
        icon: <StatusIcon glyph="minus" tone="idle" />,
        label: t.endedRefunds,
        count: refunds.length,
        amount: refunds.length > 0 ? formatAmount(refunds.reduce((sum, entry) => sum + entry.amount, 0)) : undefined,
        items: refunds.map((entry) => ({
          id: entry.id,
          title: entry.note,
          meta: formatAmount(entry.amount),
          projectId: entry.projectId,
          onSelect: () => openEntryForm({ mode: "edit", entryId: entry.id }),
        })),
      },
    ]
  }, [t, data, period, openTask, openEntryForm])

  return (
    <BoardColumn title={t.ended} count={rows.reduce((sum, row) => sum + row.count, 0)} bodyClassName="gap-0 pb-1">
      {rows.map((row) =>
        row.count === 0 ? (
          <div key={row.key} className="flex h-8 items-center gap-2 px-2 text-sm text-fg-2">
            {row.icon}
            <span className="truncate">{row.label}</span>
            <span className="tabular">0</span>
          </div>
        ) : (
          <Popover key={row.key}>
            <PopoverTrigger asChild>
              <CollapsedRow icon={row.icon} label={row.label} count={row.count} meta={row.amount} />
            </PopoverTrigger>
            <PopoverContent side="left" align="start" className="w-72 gap-0 p-0">
              <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-sm font-medium">
                {row.icon}
                {row.label}
                <span className="font-normal text-fg-2 tabular">{row.count}</span>
              </div>
              <ul className="scroll-thin max-h-72 overflow-y-auto p-1">
                {row.items.slice(0, LIMIT).map((item) => {
                  const project = item.projectId ? projectsById.get(item.projectId) : undefined
                  const content = (
                    <>
                      {project ? (
                        <ProjectMark name={project.name} color={project.color} size={14} />
                      ) : (
                        <span aria-hidden className="size-3.5 shrink-0 rounded-[4px] border border-dashed border-line-3" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="shrink-0 text-xs text-fg-2 tabular">{item.meta}</span>
                    </>
                  )
                  return (
                    <li key={item.id}>
                      {item.onSelect ? (
                        <button
                          type="button"
                          onClick={item.onSelect}
                          className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-hover", focusRingInset)}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex h-8 items-center gap-2 px-2 text-sm">{content}</div>
                      )}
                    </li>
                  )
                })}
                {row.items.length > LIMIT && <li className="px-2 py-1.5 text-xs text-fg-2">{t.moreItems(row.items.length - LIMIT)}</li>}
              </ul>
            </PopoverContent>
          </Popover>
        )
      )}
    </BoardColumn>
  )
}

/** 动态：这段时间里完成的事、进出的钱、达成的里程碑，按时间倒序 */
export function ActivityColumn({ data, period }: { data: WorkbenchData; period: Period }) {
  const t = useT().insights
  const openTask = useUi((state) => state.openTask)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const projectsById = useProjectsById()
  const now = useNow(60_000)
  const entries = useMemo(() => new Map(data.ledger.map((entry) => [entry.id, entry])), [data.ledger])
  const events = useMemo(() => {
    const from = dayStartMs(period.start)
    const to = dayStartMs(addDays(period.end, 1))
    return deriveEvents(data)
      .filter((event) => event.at >= from && event.at < to)
      .slice(0, LIMIT)
  }, [data, period])

  return (
    <BoardColumn title={t.activity}>
      <Surface className="py-1">
        {events.length === 0 ? (
          <EmptyState icon={Inbox} title={t.activityEmpty} />
        ) : (
          <ol>
            {events.map((event) => {
              const project = event.projectId ? projectsById.get(event.projectId) : undefined
              const entry = event.entryId ? entries.get(event.entryId) : undefined
              const select = event.taskId
                ? () => openTask(event.taskId ?? "")
                : event.entryId
                  ? () => openEntryForm({ mode: "edit", entryId: event.entryId ?? "" })
                  : undefined
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    disabled={!select}
                    onClick={select}
                    className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left enabled:hover:bg-hover", focusRingInset)}
                  >
                    <span className="pt-0.5">
                      <EventGlyph kind={event.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{event.title}</span>
                      <span className="block truncate text-xs text-fg-2">
                        {eventText(event.kind, t)}
                        {entry && ` ${formatAmount(entry.amount)}`}
                        {project && ` · ${project.name}`}
                      </span>
                    </span>
                    <time className="shrink-0 pt-px text-xs text-fg-2" dateTime={new Date(event.at).toISOString()}>
                      {formatAgo(event.at, now)}
                    </time>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </Surface>
    </BoardColumn>
  )
}
