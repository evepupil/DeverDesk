// 提供 UTC 日期键，在线版“今天”和默认“本月”统一按 UTC 计算。
function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function utcDayKey(now = Date.now()): string {
  const date = new Date(now)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function utcMonthKey(now = Date.now()): string {
  return utcDayKey(now).slice(0, 7)
}

export function monthPeriod(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${pad(lastDay)}` }
}
