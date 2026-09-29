import type { Messages } from "../types"

export const review: Messages["review"] = {
  title: (week) => `Review · ${week}`,
  deletedProject: "Deleted project",
  filter: {
    doneBefore: "Done ",
    doneAfter: "",
    invested: "Tracked",
    net: "Net",
  },
  summary: {
    thanWeek: "last week",
    thanPartial: "this time last week",
    done: (done, comparison) => `${done} ${done === 1 ? "task" : "tasks"} done${comparison}.`,
    invested: (minutes, comparison, share) => `Tracked ${minutes}${comparison}; ${share}`,
    share: (project, percent) => `${project} took ${percent}% of tracked time.`,
    net: (net, income, expense) => `Net ${net} (${income} in, ${expense} out).`,
    accuracy: (direction, percent) => {
      if (direction === "same") return "Tracked time matched the estimates."
      return `Tracked time was ${percent}% ${direction === "over" ? "over" : "under"} the estimates.`
    },
    routines: (done, due) => `Routines: ${done}/${due} done.`,
    compare: {
      tasks: {
        same: (than) => `, same as ${than}`,
        more: (diff, than) => `, ${diff} more than ${than}`,
        less: (diff, than) => `, ${diff} fewer than ${than}`,
      },
      minutes: {
        same: (than) => `, same as ${than}`,
        more: (amount, than) => `, up ${amount} from ${than}`,
        less: (amount, than) => `, down ${amount} from ${than}`,
      },
    },
  },
  digest: {
    heading: "This week",
    notStarted: "This week hasn't started yet",
  },
  done: {
    title: "Done",
    empty: "Nothing done this week yet",
    more: (n) => `${n} more`,
  },
  time: {
    title: "Time",
    perDay: "By day",
    perDayAside: "Tracked / available",
    byProject: "Where it went",
  },
  money: {
    title: "Money",
    income: "Income",
    expense: "Expenses",
    net: "Net",
  },
  past: {
    title: "Past weeks",
    noted: "Notes written",
    stats: (done, hours, amount) => `${done} done · ${hours} · ${amount}`,
  },
  notes: {
    title: "Review",
    wins: { label: "What went well", placeholder: "The one thing you're happiest about" },
    improve: { label: "What could be better", placeholder: "Where you got stuck, stalled, or guessed wrong" },
    next: { label: "Next week, only", placeholder: "The one or two things that matter most" },
    saved: "Saved",
  },
}
