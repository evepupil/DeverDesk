/** 日期和时间的说法 */
export const calendar = {
  /** 下标 0 是周日 */
  weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  monthDay: (month: number, day: number) => `${month}月${day}日`,
  dayLong: (monthDay: string, weekday: string) => `${monthDay} ${weekday}`,
  month: (month: number) => `${month}月`,
  yearMonth: (year: number, month: number) => `${year}年${month}月`,
  today: "今天",
  tomorrow: "明天",
  yesterday: "昨天",
  dayAfterTomorrow: "后天",
  justNow: "刚刚",
  minutesAgo: (n: number) => `${n} 分钟前`,
  hoursAgo: (n: number) => `${n} 小时前`,
  daysAgo: (n: number) => `${n} 天前`,
}
