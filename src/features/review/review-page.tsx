"use client"

import { cn } from "cn"
import { Check, CheckCheck, History, Timer, Wallet } from "lucide-react"
import { useMemo } from "react"

import { BoardColumn, CardHeading, Surface } from "@/components/base/board"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { addDays, dayKeyOf, formatDayShort, formatWeekRange, weekStart, weekdayLabel } from "@/domain/calendar"
import { formatAmount, formatHours, formatMinutes, formatSignedAmount } from "@/domain/format"
import { doneIn, minutesIn } from "@/domain/insights"
import { totals } from "@/domain/ledger"
import { projectNameOf, summarize, weekReview } from "@/domain/review"
import { useT } from "@/i18n/react"
import { FilterBar, PageFrame } from "@/features/shell/page-frame"
import { focusRingInset } from "@/lib/styles"
import { useProjectsById, useToday, useWorkbenchData } from "@/state/hooks"
import { useUi } from "@/state/ui"
import { WeekNav, useWeekParam, weekTitle } from "../common/week-nav"
import { ReviewNotes } from "./review-notes"

const DONE_LIMIT = 12
const PAST_WEEKS = 8

/**
 * 每周回顾：自动把这一周做了什么、时间花在哪、赚了多少写成几句话，
 * 再留三段自己的复盘。右边列出往期，方便对照。
 */
export function ReviewPage() {
  const t = useT()
  const data = useWorkbenchData()
  const today = useToday()
  const projectsById = useProjectsById()
  const openTask = useUi((state) => state.openTask)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const [week, setWeek] = useWeekParam(today)

  const review = useMemo(() => weekReview(data, week, today), [data, week, today])
  const lines = useMemo(() => summarize(review, projectNameOf(data.projects), formatMinutes, formatAmount), [review, data.projects])
  const weekEntries = useMemo(
    () => data.ledger.filter((entry) => entry.date >= review.start && entry.date <= review.end).sort((a, b) => b.date.localeCompare(a.date)),
    [data.ledger, review]
  )
  const byProject = useMemo(() => [...review.minutesByProject.entries()].sort((a, b) => b[1] - a[1]), [review])
  const past = useMemo(() => {
    const current = weekStart(today)
    return Array.from({ length: PAST_WEEKS }, (_, i) => {
      const start = addDays(current, -7 * i)
      const period = { start, end: addDays(start, 6) }
      return {
        start,
        done: doneIn(data.tasks, period).length,
        minutes: minutesIn(data.entries, period),
        net: totals(data.ledger, period.start, period.end).net,
        noted: data.notes.some((note) => note.week === start && (note.wins || note.improve || note.next)),
      }
    })
  }, [data, today])

  const maxDay = Math.max(1, ...review.days.map((day) => Math.max(day.actual, day.capacity)))
  const maxProject = Math.max(1, ...byProject.map(([, minutes]) => minutes))
  const future = week > weekStart(today)

  const filterBar = (
    <FilterBar
      left={
        <span className="flex items-center gap-3 text-xs text-fg-2 tabular">
          <span>
            {t.review.filter.doneBefore}<span className="text-fg">{review.done.length}</span>
            {t.review.filter.doneAfter}
          </span>
          <span>
            {t.review.filter.invested} <span className="text-fg">{formatHours(review.minutes)}</span>
          </span>
          <span>
            {t.review.filter.net} <span className={cn("text-fg", review.net < 0 && "text-bad")}>{formatAmount(review.net)}</span>
          </span>
        </span>
      }
    />
  )

  return (
    <PageFrame
      title={t.review.title(weekTitle(week, today))}
      meta={<span className="hidden truncate sm:inline">{formatWeekRange(week)}</span>}
      actions={<WeekNav week={week} today={today} onChange={setWeek} />}
      filterBar={filterBar}
    >
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-3">
          <Surface className="flex flex-col gap-1.5 px-4 py-3">
            <h2 className="text-xs font-medium text-fg-2">{t.review.digest.heading}</h2>
            {future ? (
              <p className="text-sm text-fg-2">{t.review.digest.notStarted}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Surface>

          <div className="grid items-start gap-(--gap-card) md:grid-cols-2 lg:grid-cols-3">
            <BoardColumn icon={<CheckCheck className="size-4 text-fg-2" aria-hidden />} title={t.review.done.title} count={review.done.length}>
              <Surface className="overflow-hidden">
                {review.done.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-fg-2">{t.review.done.empty}</p>
                ) : (
                  <ul className="py-1">
                    {review.done.slice(0, DONE_LIMIT).map((task) => {
                      const project = projectsById.get(task.projectId ?? "")
                      return (
                        <li key={task.id}>
                          <button
                            type="button"
                            onClick={() => openTask(task.id)}
                            className={cn("flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-sm hover:bg-hover", focusRingInset)}
                          >
                            <StatusIcon glyph="check" tone="done" />
                            <span className="min-w-0 flex-1 truncate">{task.title}</span>
                            {project && <ProjectMark name={project.name} color={project.color} size={14} />}
                            <span className="w-8 shrink-0 text-right text-xs text-fg-2">
                              {weekdayLabel(dayKeyOf(new Date(task.completedAt ?? 0)))}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                    {review.done.length > DONE_LIMIT && (
                      <li className="px-3 py-1.5 text-xs text-fg-2">{t.review.done.more(review.done.length - DONE_LIMIT)}</li>
                    )}
                  </ul>
                )}
              </Surface>
            </BoardColumn>

            <BoardColumn icon={<Timer className="size-4 text-fg-2" aria-hidden />} title={t.review.time.title} meta={formatHours(review.minutes)}>
              <Surface className="flex flex-col gap-2 px-3 py-2.5">
                <CardHeading title={t.review.time.perDay} aside={t.review.time.perDayAside} />
                <ul className="flex flex-col gap-1.5">
                  {review.days.map((day) => (
                    <li key={day.day} className="flex items-center gap-2 text-xs">
                      <span className={cn("w-8 shrink-0", day.day === today ? "text-fg" : "text-fg-2")}>{weekdayLabel(day.day)}</span>
                      <span aria-hidden className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-pressed/50">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-(--tier-1)" style={{ width: `${(day.capacity / maxDay) * 100}%` }} />
                        <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${(day.actual / maxDay) * 100}%` }} />
                      </span>
                      <span className="w-[4.5rem] shrink-0 text-right text-fg-2 tabular">
                        {formatMinutes(day.actual)}/{formatMinutes(day.capacity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Surface>
              {byProject.length > 0 && (
                <Surface className="flex flex-col gap-2 px-3 py-2.5">
                  <CardHeading title={t.review.time.byProject} />
                  <ul className="flex flex-col gap-1.5">
                    {byProject.map(([projectId, minutes]) => {
                      const project = projectId ? projectsById.get(projectId) : undefined
                      return (
                        <li key={projectId ?? "none"} className="flex items-center gap-2 text-xs">
                          {project ? (
                            <ProjectMark name={project.name} color={project.color} size={14} />
                          ) : (
                            <span aria-hidden className="size-3.5 shrink-0 rounded-[4px] border border-dashed border-line-3" />
                          )}
                          <span className="w-16 shrink-0 truncate text-fg">{project?.name ?? t.common.personal}</span>
                          <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-pressed/50">
                            <span className="block h-full rounded-full bg-(--tier-2)" style={{ width: `${(minutes / maxProject) * 100}%` }} />
                          </span>
                          <span className="w-12 shrink-0 text-right text-fg-2 tabular">{formatMinutes(minutes)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </Surface>
              )}
            </BoardColumn>

            <BoardColumn icon={<Wallet className="size-4 text-fg-2" aria-hidden />} title={t.review.money.title} meta={formatSignedAmount(review.net)}>
              <Surface className="grid grid-cols-3 divide-x divide-line">
                {[
                  { label: t.review.money.income, value: review.income },
                  { label: t.review.money.expense, value: review.expense },
                  { label: t.review.money.net, value: review.net },
                ].map((item) => (
                  <div key={item.label} className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                    <span className="text-xs text-fg-2">{item.label}</span>
                    <span className={cn("truncate text-sm font-medium tabular", item.value < 0 && "text-bad")}>{formatAmount(item.value)}</span>
                  </div>
                ))}
              </Surface>
              {weekEntries.length > 0 && (
                <Surface className="overflow-hidden">
                  <ul className="py-1">
                    {weekEntries.slice(0, 10).map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => openEntryForm({ mode: "edit", entryId: entry.id })}
                          className={cn("flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-sm hover:bg-hover", focusRingInset)}
                        >
                          <span className="w-9 shrink-0 text-xs text-fg-2 tabular">{formatDayShort(entry.date)}</span>
                          <span className={cn("min-w-0 flex-1 truncate", entry.status !== "received" && "text-fg-2")}>{entry.note}</span>
                          <span className={cn("shrink-0 tabular", entry.kind === "expense" && "text-fg-2")}>
                            {formatSignedAmount(entry.kind === "income" ? entry.amount : -entry.amount)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Surface>
              )}
            </BoardColumn>
          </div>

          {!future && <ReviewNotes week={week} />}
        </div>

        <BoardColumn icon={<History className="size-4 text-fg-2" aria-hidden />} title={t.review.past.title} className="self-start">
          <Surface className="overflow-hidden">
            <ul className="py-1">
              {past.map((item) => (
                <li key={item.start}>
                  <button
                    type="button"
                    aria-current={item.start === week ? "true" : undefined}
                    onClick={() => setWeek(item.start)}
                    className={cn(
                      "flex w-full min-w-0 flex-col gap-0.5 px-3 py-2 text-left hover:bg-hover",
                      item.start === week && "bg-selected hover:bg-selected",
                      focusRingInset
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="truncate">{weekTitle(item.start, today)}</span>
                      <span className="text-xs text-fg-2 tabular">{formatDayShort(item.start)}</span>
                      {item.noted && <Check className="ml-auto size-3.5 text-fg-2" aria-label={t.review.past.noted} />}
                    </span>
                    <span className="text-xs text-fg-2 tabular">
                      {t.review.past.stats(item.done, formatHours(item.minutes), formatAmount(item.net))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Surface>
        </BoardColumn>
      </div>
    </PageFrame>
  )
}
