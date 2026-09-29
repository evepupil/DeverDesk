import type { Messages } from "../types"

export const today: Messages["today"] = {
  undo: "Undo",
  page: {
    title: "Today",
    addEntry: "New entry",
    newTask: "New task",
    autoSchedule: "Auto-schedule",
    autoScheduleShort: "Auto",
  },
  load: {
    aria: "Adjust daily available time",
    tasks: "Tasks",
    routines: "Routines",
  },
  arrange: {
    noRoom: "No room left today",
    noRoomHint: "Move some to tomorrow, or adjust available time",
    done: (n) => `Scheduled ${n} ${n === 1 ? "task" : "tasks"}`,
    leftover: (n) => `, ${n} didn't fit`,
  },
  timeline: {
    title: "Timeline",
    unplaced: (n) => `${n} unscheduled`,
    blockAria: (title, range) => `${title}, ${range}. Use arrow keys to move, hold Shift to resize`,
    empty: "Drag tasks here, or click an empty slot to schedule",
    slotStart: (time) => `Starting ${time}`,
  },
  rollover: {
    moved: (n) => `Moved ${n} ${n === 1 ? "task" : "tasks"} to today`,
    count: (n) => `${n} planned earlier, still unfinished`,
    move: "Move to today",
    late: (n) => `${n} ${n === 1 ? "day" : "days"} late`,
    more: (n) => `${n} more`,
  },
  plan: {
    title: "Today's plan",
    newTask: "New task for today",
    empty: "Nothing planned for today yet",
    allDone: "All done for today",
    placeholder: "Add to today, e.g. Reply comments 15m #Blog",
    done: "Done today",
  },
  suggestions: {
    title: "Add to today",
    add: (title) => `Add to today: ${title}`,
    added: "Added to today",
  },
  streakUnit: { daily: "day", weekdays: "day", weekly: "week", monthly: "month" },
  routines: {
    title: "Routines",
    new: "New routine",
    empty: "No routines due today",
    streak: (n, unit) => `${n}-${unit} streak`,
  },
  money: {
    title: "Money",
    netThisMonth: "Net this month",
    meterAria: "Net income this month vs. monthly target",
    target: (amount) => `Target ${amount}`,
    pending: (n) => `${n} awaiting payment`,
  },
  focus: {
    title: "Time tracked",
    empty: "No time tracked today yet",
  },
}
