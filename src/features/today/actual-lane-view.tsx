"use client"

import { useMemo, useState, type PointerEvent } from "react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMinutes } from "@/domain/format"
import type { Task, TimeEntry } from "@/domain/types"
import { useT } from "@/i18n/react"
import { useProjectsById } from "@/state/hooks"
import type { LiveWindowRow } from "./live-windows"
import { layoutActualLane, findActualLaneBarsAtY } from "./actual-lane"

interface ActualLaneProps {
  entries: TimeEntry[]
  tasks: Task[]
  windows: LiveWindowRow[]
  rangeStart: number
  rangeEnd: number
  now: number
  px: number
}

/** A visual rail whose single tooltip follows the pointer across the full track. */
export function ActualLane({ entries, tasks, windows, rangeStart, rangeEnd, now, px }: ActualLaneProps) {
  const t = useT()
  const [pointerY, setPointerY] = useState<number | null>(null)
  const bars = useMemo(
    () => layoutActualLane(entries, windows, rangeStart, rangeEnd, now),
    [entries, windows, rangeStart, rangeEnd, now]
  )
  const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const windowsBySession = useMemo(() => new Map(windows.map((window) => [window.session, window])), [windows])
  const projectsById = useProjectsById()
  const activeBars = pointerY === null ? [] : findActualLaneBarsAtY(bars, pointerY, px)
  const activeBarKeys = new Set(activeBars.map((bar) => `${bar.source}:${bar.id}`))
  const tooltipRows = activeBars.slice(0, 6).map((bar) => {
    const entry = bar.source === "entry" ? entriesById.get(bar.id) : undefined
    const task = entry?.taskId ? tasksById.get(entry.taskId) : undefined
    const window = bar.source === "live" ? windowsBySession.get(bar.id) : undefined
    const projectId = entry?.projectId ?? window?.projectId ?? null
    const project = projectsById.get(projectId ?? "")
    const title = window?.projectName ?? task?.title ?? project?.name ?? t.common.personal

    return {
      key: `${bar.source}:${bar.id}`,
      text: t.today.timeline.actualTooltip(title, formatMinutes(bar.minutes)),
    }
  })
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    setPointerY(event.clientY - bounds.top)
  }

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <div
        data-actual-lane
        aria-hidden="true"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setPointerY(null)}
        className="pointer-events-auto absolute inset-y-0 left-11 z-[5] hidden w-1.5 overflow-hidden md:block"
      >
        {bars.map((bar) => {
          const entry = bar.source === "entry" ? entriesById.get(bar.id) : undefined
          const task = entry?.taskId ? tasksById.get(entry.taskId) : undefined
          const window = bar.source === "live" ? windowsBySession.get(bar.id) : undefined
          const projectId = entry?.projectId ?? window?.projectId ?? null
          const project = projectsById.get(projectId ?? "")
          const title = window?.projectName ?? task?.title ?? project?.name ?? t.common.personal
          const fill = project ? `var(--label-${project.color})` : "var(--line-strong)"
          const background = bar.ongoing
            ? `linear-gradient(to bottom, ${fill} 0%, ${fill} 65%, transparent 100%)`
            : fill
          const tooltip = t.today.timeline.actualTooltip(title, formatMinutes(bar.minutes))
          const tooltipId = `${bar.source}:${bar.id}`

          return (
            <span
              key={tooltipId}
              data-actual-bar
              aria-label={tooltip}
              className="pointer-events-none absolute block min-h-[2px] origin-center rounded-[1px]"
              style={{
                top: bar.top * px,
                height: bar.height * px,
                left: `${(bar.lane / bar.lanes) * 100}%`,
                width: `${100 / bar.lanes}%`,
                background,
                boxShadow: bar.lanes > 1 ? "inset -1px 0 0 var(--surface-card)" : undefined,
                filter: activeBarKeys.has(tooltipId) ? "brightness(1.3)" : undefined,
              }}
            />
          )
        })}
        <Tooltip open={activeBars.length > 0}>
          <TooltipTrigger asChild>
            <span
              aria-hidden="true"
              tabIndex={-1}
              className="pointer-events-none absolute left-0 size-px"
              style={{ top: pointerY ?? 0 }}
            />
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="flex min-w-0 flex-col items-start gap-1">
              {tooltipRows.map((row) => (
                <span key={row.key} className="max-w-[16rem] truncate">{row.text}</span>
              ))}
              {activeBars.length > tooltipRows.length && (
                <span>{t.today.timeline.actualTooltipMore(activeBars.length - tooltipRows.length)}</span>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
