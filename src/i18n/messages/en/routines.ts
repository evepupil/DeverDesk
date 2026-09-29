import type { Messages } from "../types"

export const routines: Messages["routines"] = {
  newRoutine: "New routine",
  groups: {
    day: "Daily",
    week: "Weekly",
    month: "Monthly",
    archived: "Archived",
  },
  progress: {
    day: "Today",
    week: "This week",
    month: "This month",
  },
  empty: "No routines yet",
  emptyGroup: "No routines",
  collapseColumn: "Collapse column",
  expandGroup: (group, count) => `Show ${group}, ${count} ${count === 1 ? "routine" : "routines"}`,
  card: {
    streak: (count, unit) => `${count}-${unit} streak`,
    noStreak: "No streak yet",
    actions: (title) => `Actions for "${title}"`,
    archive: "Archive",
    restore: "Restore",
    archived: (title) => `Archived "${title}"`,
    periodDone: (period) => `Done ${period.toLowerCase()}`,
  },
  streakUnit: {
    daily: "day",
    weekdays: "day",
    weekly: "week",
    monthly: "month",
  },
  rate: {
    weeks12: "Last 12 weeks",
    months6: "Last 6 months",
    days30: "Last 30 days",
  },
  heat: {
    title: (when, state) => `${when}: ${state}`,
    weekOf: (day) => `Week of ${day}`,
    future: "Not yet",
    notNeeded: "Not scheduled",
    done: "Done",
    missed: "Missed",
    summary: (due, done) => `${done} of the last ${due} ${due === 1 ? "period" : "periods"} done`,
  },
}
