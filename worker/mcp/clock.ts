import type { DayKey } from "../../src/domain/types"
import type { Clock } from "./types"

const MINUTE_MS = 60_000
const SECOND_MS = 1_000
const DAY_MS = 86_400_000
const MAX_TIME_ZONES = 24
const MAX_DAYS_PER_TIME_ZONE = 400
const MAX_DATE_MS = 8_640_000_000_000_000

interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

interface DayOffsets {
  start: number
  end: number
  stable: number | null
}

interface TimeZoneCache {
  formatter: Intl.DateTimeFormat
  days: Map<number, DayOffsets>
}

const timeZoneCaches = new Map<string, TimeZoneCache>()

function cacheFor(timeZone: string): TimeZoneCache {
  const cached = timeZoneCaches.get(timeZone)
  if (cached) {
    timeZoneCaches.delete(timeZone)
    timeZoneCaches.set(timeZone, cached)
    return cached
  }

  const created = {
    formatter: new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    days: new Map<number, DayOffsets>(),
  }
  timeZoneCaches.set(timeZone, created)
  if (timeZoneCaches.size > MAX_TIME_ZONES) {
    const oldest = timeZoneCaches.keys().next().value
    if (oldest !== undefined) timeZoneCaches.delete(oldest)
  }
  return created
}

function partsAt(formatter: Intl.DateTimeFormat, ms: number): DateParts {
  const parts = formatter.formatToParts(ms)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  }
}

function utcFromParts(parts: Pick<DateParts, "year" | "month" | "day" | "hour" | "minute" | "second">): number {
  const date = new Date(0)
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0)
  return date.getTime()
}

function preciseOffsetAt(cache: TimeZoneCache, ms: number): number {
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return Number.NaN
  const wholeSecond = Math.floor(ms / SECOND_MS) * SECOND_MS
  return (utcFromParts(partsAt(cache.formatter, wholeSecond)) - wholeSecond) / MINUTE_MS
}

function dayOffsets(cache: TimeZoneCache, dayStart: number): DayOffsets {
  const cached = cache.days.get(dayStart)
  if (cached) {
    cache.days.delete(dayStart)
    cache.days.set(dayStart, cached)
    return cached
  }

  const start = preciseOffsetAt(cache, dayStart)
  const end = preciseOffsetAt(cache, dayStart + DAY_MS - SECOND_MS)
  const offsets = { start, end, stable: start === end ? start : null }
  cache.days.set(dayStart, offsets)
  if (cache.days.size > MAX_DAYS_PER_TIME_ZONE) {
    const oldest = cache.days.keys().next().value
    if (oldest !== undefined) cache.days.delete(oldest)
  }
  return offsets
}

function offsetAt(cache: TimeZoneCache, ms: number): number {
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return Number.NaN
  const dayStart = Math.floor(ms / DAY_MS) * DAY_MS
  const offsets = dayOffsets(cache, dayStart)
  return offsets.stable ?? preciseOffsetAt(cache, ms)
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0")
}

function dayKey(parts: DateParts): DayKey {
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`
}

function parseDayKey(text: string): Pick<DateParts, "year" | "month" | "day"> | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day }
}

export function createClock(timeZone: string | undefined, now: number): Clock {
  let resolvedTimeZone = "UTC"
  let timeZoneKnown = false
  if (typeof timeZone === "string" && timeZone.length > 0) {
    try {
      cacheFor(timeZone)
      resolvedTimeZone = timeZone
      timeZoneKnown = true
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
    }
  }

  const zoneCache = cacheFor(resolvedTimeZone)
  const localParts = (ms: number): DateParts | null => {
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return null
    try {
      return partsAt(zoneCache.formatter, ms)
    } catch (error) {
      if (error instanceof RangeError) return null
      throw error
    }
  }
  const wallAt = (ms: number) => Number.isFinite(ms) && Math.abs(ms) <= MAX_DATE_MS
    ? ms + offsetAt(zoneCache, ms) * MINUTE_MS
    : Number.NaN

  function fromWall(wallMs: number): number {
    const offsets = new Set<number>()
    for (let day = -2; day <= 2; day += 1) {
      offsets.add(offsetAt(zoneCache, wallMs + day * DAY_MS))
    }
    const candidates = [...offsets].map((offset) => {
      const timestamp = wallMs - offset * MINUTE_MS
      return { timestamp, wall: wallAt(timestamp) }
    })
    const exact = candidates.filter((candidate) => candidate.wall === wallMs)
    if (exact.length > 0) return Math.min(...exact.map((candidate) => candidate.timestamp))

    // 跳时没有精确候选时，选择最接近且晚于请求墙钟的时刻；重叠时则在上面统一取最早候选。
    const afterGap = candidates
      .filter((candidate) => candidate.wall > wallMs)
      .sort((a, b) => a.wall - b.wall || a.timestamp - b.timestamp)[0]
    return afterGap?.timestamp ?? candidates[0]?.timestamp ?? Number.NaN
  }

  function parseLocal(text: string, defaultDay?: DayKey): number | null {
    const fullMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(text)
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(text)
    if (!fullMatch && !timeMatch) return null

    const nowParts = localParts(now)
    const dateText = fullMatch?.[1] ?? defaultDay ?? (nowParts === null ? "" : dayKey(nowParts))
    const date = parseDayKey(dateText)
    if (!date) return null
    const hour = Number(fullMatch?.[2] ?? timeMatch?.[1])
    const minute = Number(fullMatch?.[3] ?? timeMatch?.[2])
    if (hour > 23 || minute > 59) return null
    return fromWall(utcFromParts({ ...date, hour, minute, second: 0 }))
  }

  const todayParts = localParts(now)
  const clock: Clock = {
    timeZone: resolvedTimeZone,
    timeZoneKnown,
    now,
    today: todayParts === null ? "" as DayKey : dayKey(todayParts),
    dayOf(ms) {
      const parts = localParts(ms)
      return parts === null ? "" as DayKey : dayKey(parts)
    },
    startOfDay(day) {
      const date = parseDayKey(day)
      if (!date) return Number.NaN
      return fromWall(utcFromParts({ ...date, hour: 0, minute: 0, second: 0 }))
    },
    toWall(ms) {
      return wallAt(ms)
    },
    fromWall,
    parseLocal,
    formatLocal(ms) {
      const parts = localParts(ms)
      return parts === null ? "" : `${dayKey(parts)} ${pad(parts.hour)}:${pad(parts.minute)}`
    },
    formatLocalTime(ms) {
      const parts = localParts(ms)
      return parts === null ? "" : `${pad(parts.hour)}:${pad(parts.minute)}`
    },
    minuteOfDay(ms) {
      const parts = localParts(ms)
      return parts === null ? Number.NaN : parts.hour * 60 + parts.minute
    },
  }
  return clock
}
