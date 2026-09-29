import { DEFAULT_CURRENCY } from "../i18n/locales"
import { getCurrency, getLocale, getT } from "../i18n/runtime"

/** 时长和金额的显示格式；给人看的文字按当前语言和当前记账币种输出 */

/** 卡片上的短写：45m、1h、1.5h、2h10m */
export function formatMinutes(minutes: number): string {
  const value = Math.max(0, Math.round(minutes))
  if (value < 60) return `${value}m`
  const hours = Math.floor(value / 60)
  const rest = value % 60
  if (rest === 0) return `${hours}h`
  if (rest === 30) return `${hours}.5h`
  return `${hours}h${rest}m`
}

/** 详情里的全写：45 分钟、1 小时 30 分钟（英文 45 min、1 hr 30 min） */
export function formatMinutesLong(minutes: number): string {
  const value = Math.max(0, Math.round(minutes))
  const words = getT().format
  if (value < 60) return words.minutes(value)
  const hours = Math.floor(value / 60)
  const rest = value % 60
  return rest === 0 ? words.hours(hours) : words.hoursMinutes(hours, rest)
}

/** 统计用的小时数：12.5h */
export function formatHours(minutes: number): string {
  const hours = minutes / 60
  if (hours === 0) return "0h"
  return `${hours >= 100 ? Math.round(hours) : Number(hours.toFixed(1))}h`
}

/** 计时器：00:12:33 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":")
}

const amountFormats = new Map<string, Intl.NumberFormat>()

type AmountStyle = "full" | "compact"

const AMOUNT_OPTIONS: Record<AmountStyle, Intl.NumberFormatOptions> = {
  full: { style: "currency", minimumFractionDigits: 0, maximumFractionDigits: 2 },
  compact: { style: "currency", notation: "compact", maximumFractionDigits: 1 },
}

/** 按当前语言和记账币种的金额格式，建一次缓存起来 */
function amountFormat(style: AmountStyle): Intl.NumberFormat {
  const key = `${style}|${getLocale()}|${getCurrency()}`
  let format = amountFormats.get(key)
  if (!format) {
    try {
      format = new Intl.NumberFormat(getLocale(), { ...AMOUNT_OPTIONS[style], currency: getCurrency() })
    } catch {
      // 个人设置里的币种代码不认识时按默认币种显示
      format = new Intl.NumberFormat(getLocale(), { ...AMOUNT_OPTIONS[style], currency: DEFAULT_CURRENCY })
    }
    amountFormats.set(key, format)
  }
  return format
}

/** 收支金额，保留到分：¥1,280、¥19.9（按当前语言和记账币种） */
export function formatAmount(value: number): string {
  return amountFormat("full").format(value)
}

/** 金额输入框标签里的单位：中文界面的人民币写「元」，其余写货币符号（$、€、CN¥） */
export function amountUnit(): string {
  const named = getT().format.currencyUnit(getCurrency())
  if (named) return named
  return amountFormat("full").formatToParts(0).find((part) => part.type === "currency")?.value ?? getCurrency()
}

/** 图表坐标轴上的紧凑金额：¥3.7万、$12.5K（按当前语言和记账币种） */
export function formatAmountCompact(value: number): string {
  return amountFormat("compact").format(value).replace("-", "−")
}

/** 个人设置里的记账币种；老数据没有这一项时按默认币种 */
export function profileCurrency(profile: { currency?: string }): string {
  return profile.currency ?? DEFAULT_CURRENCY
}

export function formatSignedAmount(value: number): string {
  if (value === 0) return formatAmount(0)
  return `${value > 0 ? "+" : "−"}${formatAmount(Math.abs(value))}`
}

/** 涨跌百分比：+12.3%、−4.0%、0% */
export function formatSignedPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—"
  const value = Math.abs(ratio * 100).toFixed(digits)
  if (Number(value) === 0) return "0%"
  return `${ratio > 0 ? "+" : "−"}${value}%`
}

/** 百分点差：+0.4 个点（英文 +0.4 pts） */
export function formatPointDelta(diff: number): string {
  const value = Math.abs(diff * 100).toFixed(1)
  const words = getT().format
  if (Number(value) === 0) return words.flat
  return words.points(`${diff > 0 ? "+" : "−"}${value}`)
}
