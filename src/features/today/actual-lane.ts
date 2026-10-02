import { layoutBlocks, type Block } from "@/domain/planning"
import { minutesOf } from "@/domain/tasks"
import type { TimeEntry } from "@/domain/types"
import type { LiveWindowRow } from "./live-windows"

const MS_PER_MINUTE = 60_000

export interface ActualLaneBar {
  id: string
  source: "entry" | "live"
  top: number
  height: number
  lane: number
  lanes: number
  minutes: number
  ongoing: boolean
}

/** Lay out real time entries and active recorder windows within an epoch-millisecond range. */
export function layoutActualLane(
  entries: readonly TimeEntry[],
  windows: readonly LiveWindowRow[],
  rangeStart: number,
  rangeEnd: number,
  now: number
): ActualLaneBar[] {
  if (rangeEnd <= rangeStart) return []

  const sources = new Map<string, { source: ActualLaneBar["source"]; minutes: number; ongoing: boolean }>()
  const blocks: Block[] = []

  const add = (id: string, source: ActualLaneBar["source"], start: number, end: number, minutes: number, ongoing: boolean) => {
    const clippedStart = Math.max(start, rangeStart)
    const clippedEnd = Math.min(end, rangeEnd)
    if (clippedEnd <= clippedStart) return

    const key = `${source}:${id}`
    blocks.push({
      taskId: key,
      start: (clippedStart - rangeStart) / MS_PER_MINUTE,
      end: (clippedEnd - rangeStart) / MS_PER_MINUTE,
    })
    sources.set(key, { source, minutes, ongoing })
  }

  for (const entry of entries) {
    add(entry.id, "entry", entry.start, entry.end, minutesOf(entry), false)
  }
  for (const window of windows) {
    add(window.session, "live", window.since, Math.min(now, rangeEnd), window.minutes, true)
  }

  return layoutBlocks(blocks).map((block) => {
    const source = sources.get(block.taskId)!
    return {
      id: block.taskId.slice(source.source.length + 1),
      source: source.source,
      top: block.start,
      height: block.end - block.start,
      lane: block.lane,
      lanes: block.lanes,
      minutes: source.minutes,
      ongoing: source.ongoing,
    }
  })
}

/** Find bars covering a pixel offset within the rail, including their rendered 2px minimum height. */
export function findActualLaneBarsAtY(
  bars: readonly ActualLaneBar[],
  y: number,
  px: number
): ActualLaneBar[] {
  return bars
    .filter((bar) => {
      const top = bar.top * px
      const height = Math.max(bar.height * px, 2)
      return top <= y && y <= top + height
    })
    .sort((a, b) => a.top - b.top)
}
