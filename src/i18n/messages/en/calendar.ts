import type { Messages } from "../types"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export const calendar: Messages["calendar"] = {
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  monthDay: (month, day) => `${MONTHS[month - 1]} ${day}`,
  dayLong: (monthDay, weekday) => `${weekday}, ${monthDay}`,
  month: (month) => MONTHS[month - 1],
  yearMonth: (year, month) => `${MONTHS[month - 1]} ${year}`,
  today: "Today",
  tomorrow: "Tomorrow",
  yesterday: "Yesterday",
  dayAfterTomorrow: "In 2 days",
  justNow: "Just now",
  minutesAgo: (n) => `${n} min ago`,
  hoursAgo: (n) => `${n} hr ago`,
  daysAgo: (n) => `${n} ${n === 1 ? "day" : "days"} ago`,
}
