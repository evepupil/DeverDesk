import { getT } from "../i18n/runtime"
import type { DayKey } from "./types"

/**
 * 本地日历工具。个人工作台按真实的今天运转，所有日期都用浏览器所在时区的日历日。
 * 给人看的日期文字按当前语言输出（词条在 i18n/messages 的 calendar）。
 */

function pad(value: number) {
  return String(value).padStart(2, "0")
}

export function dayKeyOf(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayKey(now: number = Date.now()): DayKey {
  return dayKeyOf(new Date(now))
}

export function parseDay(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function dayStartMs(key: DayKey): number {
  return parseDay(key).getTime()
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = parseDay(key)
  date.setDate(date.getDate() + days)
  return dayKeyOf(date)
}

/** a 比 b 晚几天 */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((dayStartMs(a) - dayStartMs(b)) / 86_400_000)
}

/** 周一为一周的开始 */
export function weekStart(key: DayKey): DayKey {
  const weekday = parseDay(key).getDay()
  return addDays(key, weekday === 0 ? -6 : 1 - weekday)
}

export function weekDays(key: DayKey): DayKey[] {
  const start = weekStart(key)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function monthStart(key: DayKey): DayKey {
  return `${key.slice(0, 8)}01`
}

export function addMonths(key: DayKey, months: number): DayKey {
  const date = parseDay(monthStart(key))
  date.setMonth(date.getMonth() + months)
  return dayKeyOf(date)
}

export function monthEnd(key: DayKey): DayKey {
  return addDays(addMonths(key, 1), -1)
}

export function monthKeyOf(key: DayKey): string {
  return key.slice(0, 7)
}

export function isWeekend(key: DayKey): boolean {
  const weekday = parseDay(key).getDay()
  return weekday === 0 || weekday === 6
}

export function weekdayLabel(key: DayKey): string {
  return getT().calendar.weekdays[parseDay(key).getDay()]
}

export function formatDayShort(key: DayKey): string {
  const date = parseDay(key)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function formatMonthDay(key: DayKey): string {
  const date = parseDay(key)
  return getT().calendar.monthDay(date.getMonth() + 1, date.getDate())
}

export function formatDayLong(key: DayKey): string {
  return getT().calendar.dayLong(formatMonthDay(key), weekdayLabel(key))
}

export function formatMonthLabel(key: DayKey, withYear = false): string {
  const date = parseDay(key)
  const words = getT().calendar
  return withYear ? words.yearMonth(date.getFullYear(), date.getMonth() + 1) : words.month(date.getMonth() + 1)
}

/** 今天、明天、昨天、本周内的星期几，其余写日期 */
export function formatRelativeDay(key: DayKey, today: DayKey): string {
  const diff = diffDays(key, today)
  const words = getT().calendar
  if (diff === 0) return words.today
  if (diff === 1) return words.tomorrow
  if (diff === -1) return words.yesterday
  if (diff === 2) return words.dayAfterTomorrow
  if (weekStart(key) === weekStart(today)) return weekdayLabel(key)
  return formatMonthDay(key)
}

/** 一年中的第几周（周一开始，按 ISO 规则） */
export function isoWeek(key: DayKey): number {
  const date = parseDay(key)
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}

export function formatWeekRange(start: DayKey): string {
  return `${formatMonthDay(start)} – ${formatMonthDay(addDays(start, 6))}`
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`
}

/** 某个时刻是当天的第几分钟 */
export function minuteOfDay(ms: number): number {
  const date = new Date(ms)
  return date.getHours() * 60 + date.getMinutes()
}

export function isWithin(key: DayKey, start: DayKey, end: DayKey): boolean {
  return key >= start && key <= end
}

/** 动态里的时间：刚刚、12 分钟前、3 小时前、昨天、4 天前，再早写日期 */
export function formatAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000)
  const words = getT().calendar
  if (minutes < 1) return words.justNow
  const today = todayKey(now)
  const day = todayKey(at)
  if (day === today) return minutes < 60 ? words.minutesAgo(minutes) : words.hoursAgo(Math.floor(minutes / 60))
  const days = diffDays(today, day)
  if (days === 1) return words.yesterday
  if (days < 7) return words.daysAgo(days)
  return formatMonthDay(day)
}
