// 工具输入的日期时间校验：真实存在的日期、HH:mm 时间、范围跨度。
// 这里的字符串都是用户时区的本地时间；跨字段规则由各工具自己查。
import type { DayKey } from "../../../../src/domain/types"
import { ToolInputError } from "../../types"

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** 校验是真实存在的日期（2026-02-30 不行），不对就抛 ToolInputError（写明字段名） */
export function assertDay(value: string, field: string): DayKey {
  if (!DAY_PATTERN.test(value) || !isValidCalendarDay(value)) {
    throw new ToolInputError(`Invalid date "${value}" for "${field}"; expected a real date as YYYY-MM-DD, e.g. 2026-03-01.`)
  }
  return value
}

/** HH:mm，00:00–23:59 */
export function assertTime(value: string, field: string): string {
  if (!TIME_PATTERN.test(value)) {
    throw new ToolInputError(`Invalid time "${value}" for "${field}"; expected HH:mm between 00:00 and 23:59.`)
  }
  return value
}

/** 两个日期之间的天数不超过 maxDays，且 start ≤ end */
export function assertRange(start: DayKey, end: DayKey, maxDays: number, field: string): void {
  if (start > end) {
    throw new ToolInputError(`Invalid range for "${field}": start ${start} is after end ${end}.`)
  }
  if (diffDays(end, start) > maxDays) {
    throw new ToolInputError(`Date range for "${field}" is too long: ${start} to ${end} spans more than ${maxDays} days.`)
  }
}

function isValidCalendarDay(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number)
  if (month < 1 || month > 12 || day < 1) return false
  // 月份天数表，闰年只影响二月：四年一闰、百年不闰、四百年再闰
  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= monthDays[month - 1]
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** a 比 b 晚几天（两个 DayKey 都已确认是真实日期） */
function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((Date.UTC(...parseDay(a)) - Date.UTC(...parseDay(b))) / 86_400_000)
}

function parseDay(key: DayKey): [number, number, number] {
  const [year, month, day] = key.split("-").map(Number)
  return [year, month - 1, day]
}
