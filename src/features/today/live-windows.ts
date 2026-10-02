import { minuteOfDay, minutesToTime } from "@/domain/calendar"
import { formatMinutes } from "@/domain/format"
import { LIVE_EXPIRE_MS, type LiveResponse, type LiveWindow } from "@/sync/recorder-protocol"

export interface LiveWindowRow extends LiveWindow {
  projectId: string
  projectName: string
  startedAt: string
  formattedMinutes: string
}

/** Convert a live response into stable, display-ready rows and discard stale snapshots. */
export function toLiveWindowRows(response: LiveResponse, now: number): LiveWindowRow[] {
  if (now - response.updatedAt > LIVE_EXPIRE_MS) return []

  return response.windows
    .map((window) => ({
      ...window,
      startedAt: minutesToTime(minuteOfDay(window.since)),
      formattedMinutes: formatMinutes(window.minutes),
    }))
    .sort((a, b) => a.since - b.since || a.projectName.localeCompare(b.projectName) || a.session.localeCompare(b.session))
}
