import type { Locale } from "../i18n/locales"

/**
 * 页面上的日期、星数、阅读时长统一从这里格式化，页面里不自己拼。
 * 日期一律按 UTC 解释「YYYY-MM-DD」，不同时区打包出来的文字一样。
 */

const DATE_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  zh: new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }),
}

const SHORT_DATE_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  zh: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
}

function parseDay(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!match) throw new Error(`日期格式应为 YYYY-MM-DD：${day}`)
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

/** 完整日期：中文「2026年9月30日」，英文「Sep 30, 2026」 */
export function formatDate(day: string, locale: Locale): string {
  return DATE_FORMATS[locale].format(parseDay(day))
}

/** 不带年份：中文「9月30日」，英文「Sep 30」 */
export function formatShortDate(day: string, locale: Locale): string {
  return SHORT_DATE_FORMATS[locale].format(parseDay(day))
}

/** <time dateTime> 用的机器可读日期 */
export function isoDay(day: string): string {
  return parseDay(day).toISOString().slice(0, 10)
}

/**
 * GitHub 星数的显示：999 以内原样，1000 起写成 1.2k、12.3k，一百万起写成 1.2M。
 * 小数只留一位，末尾的 .0 去掉（1000 → 1k）。
 */
export function formatCount(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) return `${trimZero((count / 1000).toFixed(1))}k`
  return `${trimZero((count / 1_000_000).toFixed(1))}M`
}

function trimZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value
}

/** 星数少于这个数时，顶栏的 GitHub 按钮只写「Star」不写数字，免得新项目显得冷清 */
export const STAR_COUNT_THRESHOLD = 100

/** 顶栏、开源区块要不要显示星数：拿不到（null）或太少都不显示 */
export function shouldShowStars(stars: number | null): stars is number {
  return stars !== null && stars >= STAR_COUNT_THRESHOLD
}

/**
 * 阅读时长（分钟，至少 1）：中文按每分钟 400 字，英文按每分钟 220 个词。
 * 传入的是去掉 Markdown 标记后的正文。
 */
export function readingMinutes(text: string, locale: Locale): number {
  if (locale === "zh") {
    const han = (text.match(/[一-鿿]/g) ?? []).length
    const words = (text.replace(/[一-鿿]/g, " ").match(/[A-Za-z0-9]+/g) ?? []).length
    return Math.max(1, Math.round((han + words) / 400))
  }
  const words = (text.match(/[A-Za-z0-9'’-]+/g) ?? []).length
  return Math.max(1, Math.round(words / 220))
}

/** 时长的短写，两种语言一样（和产品一致）：30 → "30m"，75 → "1h 15m"，120 → "2h" */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
