import type { Messages } from "../types"

export const week: Messages["week"] = {
  progress: (done, total) => `${done}/${total} done`,
  loggedTotal: (minutes) => `${minutes} tracked`,
  showDone: "Show completed tasks",
  movedToToday: (n) => `Moved ${n} ${n === 1 ? "task" : "tasks"} to today`,
  loggedDay: (minutes) => `${minutes} tracked`,
  moveUnfinished: (n) => `${n} unfinished, move to today`,
  newTaskOn: (day) => `New task on ${day}`,
  dayAllDone: "All done",
  dayEmpty: "Nothing planned",
  earlier: "Left over",
  unplannedTitle: "Unscheduled",
  allPlanned: "Every task has a day",
  showMore: (n) => `Show more (${n} left)`,
}
