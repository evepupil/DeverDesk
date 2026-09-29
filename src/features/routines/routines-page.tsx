"use client"

import { Minimize2, Plus, Repeat } from "lucide-react"
import { useMemo, useState } from "react"

import { BoardColumn, CollapsedRow } from "@/components/base/board"
import { EmptyState } from "@/components/base/empty-state"
import { IconButton } from "@/components/base/icon-button"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { isDone, isDueOn, streak } from "@/domain/routines"
import type { Cadence, Routine } from "@/domain/types"
import { FilterBar, PageFrame } from "@/features/shell/page-frame"
import { useT } from "@/i18n/react"
import { useToday } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { RoutineCard } from "./routine-card"

interface RoutineGroup {
  key: string
  label: string
  cadences: Cadence[]
  items: Routine[]
  collapsed: boolean
}

const GROUPS: { key: "day" | "week" | "month"; cadences: Cadence[] }[] = [
  { key: "day", cadences: ["daily", "weekdays"] },
  { key: "week", cadences: ["weekly"] },
  { key: "month", cadences: ["monthly"] },
]

/** 例行：按频率分成每天、每周、每月三列，停用的收成短行（提炼） */
export function RoutinesPage() {
  const t = useT()
  const today = useToday()
  const routines = useWorkbench((state) => state.routines)
  const openRoutineForm = useUi((state) => state.openRoutineForm)
  const [toggled, setToggled] = useState<Set<string>>(new Set())

  const groups = useMemo<RoutineGroup[]>(() => {
    const active = routines.filter((routine) => !routine.archived)
    const order = (a: Routine, b: Routine) => streak(b, today) - streak(a, today) || a.title.localeCompare(b.title, "zh-CN")
    return [
      ...GROUPS.map((group) => ({
        ...group,
        label: t.routines.groups[group.key],
        items: active.filter((routine) => group.cadences.includes(routine.cadence)).sort(order),
        collapsed: false,
      })),
      {
        key: "archived",
        label: t.routines.groups.archived,
        cadences: [],
        items: routines.filter((routine) => routine.archived),
        collapsed: true,
      },
    ]
  }, [routines, today, t])

  const progress = GROUPS.map((group) => {
    const due = routines.filter((routine) => !routine.archived && group.cadences.includes(routine.cadence) && isDueOn(routine, today))
    return { label: t.routines.progress[group.key], done: due.filter((routine) => isDone(routine, today)).length, total: due.length }
  }).filter((item) => item.total > 0)

  const isCollapsed = (group: RoutineGroup) => group.collapsed !== toggled.has(group.key)
  const flip = (key: string) =>
    setToggled((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const expanded = groups.filter((group) => !isCollapsed(group))
  const collapsed = groups.filter((group) => isCollapsed(group) && group.items.length > 0)

  return (
    <PageFrame
      title={t.nav.pages.routines}
      actions={
        <Button variant="outline" size="sm" onClick={() => openRoutineForm(null)}>
          <Plus />
          {t.routines.newRoutine}
        </Button>
      }
      filterBar={
        <FilterBar
          left={
            <span className="flex items-center gap-3 text-xs text-fg-2 tabular">
              {progress.map((item) => (
                <span key={item.label}>
                  {item.label} <span className="text-fg">{item.done}/{item.total}</span>
                </span>
              ))}
            </span>
          }
        />
      }
      contentClassName={routines.length > 0 ? "overflow-hidden" : undefined}
    >
      {routines.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={t.routines.empty}
          className="h-full"
          action={
            <Button variant="outline" size="sm" onClick={() => openRoutineForm(null)}>
              {t.routines.newRoutine}
            </Button>
          }
        />
      ) : (
        <div className="scroll-thin flex h-full min-h-0 items-start gap-(--gap-card) overflow-x-auto scroll-px-3 p-3 max-md:snap-x max-md:snap-mandatory">
          {expanded.map((group) => (
            <BoardColumn
              key={group.key}
              icon={<Repeat className="size-4 text-fg-2" aria-hidden />}
              title={group.label}
              count={group.items.length}
              className="max-h-full w-[288px] shrink-0 snap-start xl:w-auto xl:max-w-[380px] xl:min-w-[260px] xl:flex-1"
              bodyClassName="scroll-thin overflow-y-auto"
              actions={
                <>
                  {group.key !== "archived" && (
                    <IconButton label={t.routines.newRoutine} size="icon-xs" onClick={() => openRoutineForm(null)}>
                      <Plus />
                    </IconButton>
                  )}
                  <IconButton label={t.routines.collapseColumn} size="icon-xs" onClick={() => flip(group.key)}>
                    <Minimize2 />
                  </IconButton>
                </>
              }
            >
              {group.items.length === 0 ? (
                <p className="px-2 pb-2 text-sm text-fg-2">{t.routines.emptyGroup}</p>
              ) : (
                group.items.map((routine) => <RoutineCard key={routine.id} routine={routine} today={today} />)
              )}
            </BoardColumn>
          ))}
          {collapsed.length > 0 && (
            <div className="flex w-[240px] shrink-0 snap-start flex-col gap-px rounded-lg bg-column p-1 xl:w-auto xl:max-w-[320px] xl:min-w-[200px] xl:flex-1">
              {collapsed.map((group) => (
                <CollapsedRow
                  key={group.key}
                  icon={<StatusIcon glyph="minus" tone="idle" />}
                  label={group.label}
                  count={group.items.length}
                  onClick={() => flip(group.key)}
                  aria-label={t.routines.expandGroup(group.label, group.items.length)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </PageFrame>
  )
}
