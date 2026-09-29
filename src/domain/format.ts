/** 时长和金额的显示格式 */

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

/** 详情里的全写：45 分钟、1 小时 30 分钟 */
export function formatMinutesLong(minutes: number): string {
  const value = Math.max(0, Math.round(minutes))
  if (value < 60) return `${value} 分钟`
  const hours = Math.floor(value / 60)
  const rest = value % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
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

const amountFormat = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** 收支金额，保留到分：¥1,280、¥19.9 */
export function formatAmount(value: number): string {
  return amountFormat.format(value)
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

/** 百分点差：+0.4 个点 */
export function formatPointDelta(diff: number): string {
  const value = Math.abs(diff * 100).toFixed(1)
  if (Number(value) === 0) return "持平"
  return `${diff > 0 ? "+" : "−"}${value} 个点`
}
