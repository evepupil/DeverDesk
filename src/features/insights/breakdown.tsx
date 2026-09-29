"use client"

import { cn } from "cn"
import { FolderKanban, Timer, Wallet } from "lucide-react"
import Link from "next/link"
import { Fragment, type ReactNode } from "react"

import { BoardColumn, CardHeading, Surface } from "@/components/base/board"
import { ProjectMark } from "@/components/base/marks"
import { categoryLabel } from "@/data/catalog"
import { formatAmount, formatHours } from "@/domain/format"
import type { ProjectStat } from "@/domain/insights"
import type { Project } from "@/domain/types"
import { useT } from "@/i18n/react"
import { focusRingInset } from "@/lib/styles"

function ShareRow({
  icon,
  label,
  value,
  ratio,
  detail,
  href,
}: {
  icon?: ReactNode
  label: string
  value: string
  ratio: number
  detail?: string
  href?: string
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2 text-sm">
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 tabular">{value}</span>
      </span>
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-pressed/60">
          <span className="block h-full rounded-full bg-(--tier-2)" style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
        </span>
        {detail && <span className="shrink-0 text-xs text-fg-2 tabular">{detail}</span>}
      </span>
    </>
  )
  return (
    <li>
      {href ? (
        <Link href={href} className={cn("flex flex-col gap-1 px-3 py-2 hover:bg-hover", focusRingInset)}>
          {body}
        </Link>
      ) : (
        <div className="flex flex-col gap-1 px-3 py-2">{body}</div>
      )}
    </li>
  )
}

function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%"
}

/** 副业：这段时间每个副业赚了多少、花了多少时间、时薪多少 */
export function ProjectsBreakdown({ stats, projectsById }: { stats: ProjectStat[]; projectsById: Map<string, Project> }) {
  const t = useT().insights
  const sorted = [...stats].sort((a, b) => b.net - a.net || b.minutes - a.minutes)
  const maxNet = Math.max(1, ...sorted.map((stat) => stat.net))
  const total = sorted.reduce((sum, stat) => sum + stat.net, 0)

  return (
    <BoardColumn icon={<FolderKanban className="size-4 text-fg-2" aria-hidden />} title={t.projects} meta={formatAmount(total)}>
      <Surface className="overflow-hidden">
        {sorted.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-fg-2">{t.projectsEmpty}</p>
        ) : (
          <ul className="py-1">
            {sorted.map((stat) => {
              const project = stat.projectId ? projectsById.get(stat.projectId) : undefined
              return (
                <ShareRow
                  key={stat.projectId ?? "none"}
                  icon={
                    project ? (
                      <ProjectMark name={project.name} color={project.color} size={16} />
                    ) : (
                      <span aria-hidden className="size-4 shrink-0 rounded-[4px] border border-dashed border-line-3" />
                    )
                  }
                  label={project?.name ?? t.personal}
                  value={stat.net !== 0 ? formatAmount(Math.round(stat.net)) : "—"}
                  ratio={stat.net / maxNet}
                  detail={`${formatHours(stat.minutes)}${stat.minutes > 0 && stat.net !== 0 ? ` · ${formatAmount(Math.round(stat.rate))}/h` : ""}`}
                  href={project ? `/projects?open=${project.id}` : undefined}
                />
              )
            })}
          </ul>
        )}
      </Surface>
    </BoardColumn>
  )
}

/** 钱：收入从哪来、支出花在哪 */
export function MoneyBreakdown({
  income,
  expense,
}: {
  income: { category: string; amount: number }[]
  expense: { category: string; amount: number }[]
}) {
  const incomeTotal = income.reduce((sum, row) => sum + row.amount, 0)
  const expenseTotal = expense.reduce((sum, row) => sum + row.amount, 0)
  const t = useT().insights
  return (
    <BoardColumn icon={<Wallet className="size-4 text-fg-2" aria-hidden />} title={t.money}>
      <Surface className="overflow-hidden pt-2.5">
        <CardHeading title={t.income} aside={formatAmount(incomeTotal)} className="px-3" />
        {income.length === 0 ? (
          <p className="px-3 pt-1 pb-2.5 text-sm text-fg-2">{t.incomeEmpty}</p>
        ) : (
          <ul className="py-1">
            {income.map((row) => (
              <ShareRow
                key={row.category}
                label={categoryLabel(row.category)}
                value={formatAmount(Math.round(row.amount))}
                ratio={row.amount / Math.max(1, income[0].amount)}
                detail={percent(row.amount, incomeTotal)}
              />
            ))}
          </ul>
        )}
      </Surface>
      <Surface className="overflow-hidden pt-2.5">
        <CardHeading title={t.expense} aside={formatAmount(expenseTotal)} className="px-3" />
        {expense.length === 0 ? (
          <p className="px-3 pt-1 pb-2.5 text-sm text-fg-2">{t.expenseEmpty}</p>
        ) : (
          <ul className="py-1">
            {expense.map((row) => (
              <ShareRow
                key={row.category}
                label={categoryLabel(row.category)}
                value={formatAmount(Math.round(row.amount))}
                ratio={row.amount / Math.max(1, expense[0].amount)}
                detail={percent(row.amount, expenseTotal)}
              />
            ))}
          </ul>
        )}
      </Surface>
    </BoardColumn>
  )
}

/** 时间：花在哪个副业、估时准不准、一周里哪几天最投入 */
export function TimeBreakdown({
  stats,
  projectsById,
  accuracy,
  weekdays,
}: {
  stats: ProjectStat[]
  projectsById: Map<string, Project>
  accuracy: { estimate: number; actual: number; ratio: number | null }
  weekdays: number[]
}) {
  const byTime = [...stats].filter((stat) => stat.minutes > 0).sort((a, b) => b.minutes - a.minutes)
  const total = byTime.reduce((sum, stat) => sum + stat.minutes, 0)
  const maxDay = Math.max(1, ...weekdays)
  const deviation = accuracy.ratio === null ? null : Math.round((accuracy.ratio - 1) * 100)
  const { insights: t, calendar } = useT()

  return (
    <BoardColumn icon={<Timer className="size-4 text-fg-2" aria-hidden />} title={t.time} meta={formatHours(total)}>
      <Surface className="overflow-hidden">
        {byTime.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-fg-2">{t.timeEmpty}</p>
        ) : (
          <ul className="py-1">
            {byTime.map((stat) => {
              const project = stat.projectId ? projectsById.get(stat.projectId) : undefined
              return (
                <ShareRow
                  key={stat.projectId ?? "none"}
                  icon={
                    project ? (
                      <ProjectMark name={project.name} color={project.color} size={16} />
                    ) : (
                      <span aria-hidden className="size-4 shrink-0 rounded-[4px] border border-dashed border-line-3" />
                    )
                  }
                  label={project?.name ?? t.personal}
                  value={formatHours(stat.minutes)}
                  ratio={stat.minutes / Math.max(1, byTime[0].minutes)}
                  detail={percent(stat.minutes, total)}
                />
              )
            })}
          </ul>
        )}
      </Surface>
      <Surface className="flex flex-col gap-2 px-3 py-2.5">
        <CardHeading
          title={t.accuracy}
          aside={
            deviation === null ? undefined : (
              <span className={cn(Math.abs(deviation) >= 20 && "text-warn")}>
                {deviation === 0 ? t.exact : t.deviation(deviation > 0 ? "+" : "−", Math.abs(deviation))}
              </span>
            )
          }
        />
        {accuracy.ratio === null ? (
          <p className="text-sm text-fg-2">{t.accuracyEmpty}</p>
        ) : (
          <div className="grid grid-cols-[max-content_1fr_3rem] items-center gap-x-2 gap-y-1.5 text-xs text-fg-2">
            {[
              { key: "estimate", label: t.estimated, value: accuracy.estimate },
              { key: "actual", label: t.actual, value: accuracy.actual },
            ].map((row) => (
              <Fragment key={row.key}>
                <span>{row.label}</span>
                <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-pressed/60">
                  <span
                    className={cn("block h-full rounded-full", row.key === "actual" ? "bg-ink" : "bg-(--tier-1)")}
                    style={{ width: `${(row.value / Math.max(accuracy.estimate, accuracy.actual, 1)) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular">{formatHours(row.value)}</span>
              </Fragment>
            ))}
          </div>
        )}
      </Surface>
      <Surface className="flex flex-col gap-2 px-3 py-2.5">
        <CardHeading title={t.weekdaysHeading} />
        <div className="flex h-16 items-end gap-1.5" role="img" aria-label={t.weekdaysAria(weekdays.map((minutes) => formatHours(minutes)))}>
          {weekdays.map((minutes, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={t.weekdayTitle(calendar.weekdays[(i + 1) % 7], formatHours(minutes))}>
              <span
                className={cn("w-full rounded-[2px]", i >= 5 ? "bg-ink" : "bg-(--tier-1)")}
                style={{ height: `${Math.max(2, (minutes / maxDay) * 44)}px` }}
              />
              <span className="text-xs text-fg-2">{t.weekdayChars[i]}</span>
            </div>
          ))}
        </div>
      </Surface>
    </BoardColumn>
  )
}
