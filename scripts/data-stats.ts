import { generateWorkbench } from "../src/data/seed"
import { todayKey, weekStart, addDays } from "../src/domain/calendar"
import { computeInsight, projectStats, rangePeriods } from "../src/domain/insights"
import { dayLoad } from "../src/domain/planning"
import { streak } from "../src/domain/routines"
import { weekReview, summarize, projectNameOf } from "../src/domain/review"
import { formatMinutes } from "../src/domain/format"
import { formatAmount as formatMoney } from "../src/domain/format"

const today = todayKey()
const t0 = performance.now()
const data = generateWorkbench(today, Date.now())
console.log("generated in", Math.round(performance.now() - t0), "ms; today", today)
const byStatus: Record<string, number> = {}
for (const t of data.tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
console.log("tasks", data.tasks.length, byStatus, "entries", data.entries.length, "ledger", data.ledger.length, "json KB", Math.round(JSON.stringify(data).length / 1024))
for (const range of ["4w", "12w", "12m"] as const) {
  for (const m of ["net", "hours", "rate", "done"] as const) {
    const r = computeInsight(m, data, range, today)
    console.log(range, m, Math.round(r.value), "prev", Math.round(r.previous), "series", r.series.map((p) => Math.round(m === "hours" ? p.value / 60 : p.value)).join(" "))
  }
}
const { current } = rangePeriods("12w", today)
console.log(projectStats(data, current).map((s) => `${s.projectId}: net ${Math.round(s.net)} h ${Math.round(s.minutes / 60)} rate ${Math.round(s.rate)}`).join("\n"))
console.log("today load", dayLoad(data.tasks, today, data.profile))
console.log("streaks", data.routines.map((r) => `${r.title}:${streak(r, today)}`).join(" | "))
const rev = weekReview(data, addDays(weekStart(today), -7))
console.log(summarize(rev, projectNameOf(data.projects), formatMinutes, formatMoney).join(" "))
console.log("open today", data.tasks.filter((t) => t.plannedFor === today).map((t) => `${t.id} ${t.title} ${t.status} ${t.startAt ?? ""} ${t.estimateMin}`).join("\n"))
