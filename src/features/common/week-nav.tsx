"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback } from "react"

import { IconButton } from "@/components/base/icon-button"
import { Button } from "@/components/ui/button"
import { addDays, isoWeek, weekStart } from "@/domain/calendar"
import type { DayKey } from "@/domain/types"
import { useUrlState } from "@/state/url-state"

/** 地址栏里的周（?w=那周的周一），默认本周；刷新和分享都能还原 */
export function useWeekParam(today: DayKey): [DayKey, (week: DayKey) => void] {
  const { params, update } = useUrlState()
  const current = weekStart(today)
  const raw = params.get("w")
  const week = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekStart(raw) : current
  const setWeek = useCallback((next: DayKey) => update({ w: next === current ? null : next }), [update, current])
  return [week, setWeek]
}

/** 本周、上周、下周，其余写第几周 */
export function weekTitle(week: DayKey, today: DayKey): string {
  const current = weekStart(today)
  if (week === current) return "本周"
  if (week === addDays(current, -7)) return "上周"
  if (week === addDays(current, 7)) return "下周"
  return `第 ${isoWeek(week)} 周`
}

export function WeekNav({ week, today, onChange }: { week: DayKey; today: DayKey; onChange(week: DayKey): void }) {
  const current = weekStart(today)
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label="上一周" onClick={() => onChange(addDays(week, -7))}>
        <ChevronLeft />
      </IconButton>
      <Button variant="ghost" size="sm" disabled={week === current} onClick={() => onChange(current)}>
        本周
      </Button>
      <IconButton label="下一周" onClick={() => onChange(addDays(week, 7))}>
        <ChevronRight />
      </IconButton>
    </div>
  )
}
