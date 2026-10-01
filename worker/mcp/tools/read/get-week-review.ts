import { addDays, weekStart } from "../../../../src/domain/calendar"
import { weekReview } from "../../../../src/domain/review"
import { toWallWorkbench } from "../../data/wall"
import { assertDay } from "../shared/dates"
import { DAY } from "../shared/schema"
import { projectRef } from "../shared/present"
import { presentTask, presentationContext, uniqueTasks, values, localDayBounds, sumEntryMinutesByTask } from "./common"
import type { ReadTool } from "../../types"

interface GetWeekReviewInput {
  week?: string
}

const DONE_LIMIT = 12

export const getWeekReviewTool: ReadTool<GetWeekReviewInput> = {
  kind: "read",
  name: "get_week_review",
  title: "Get week review",
  description: "Read a week's completed work, time, money, estimates, routines, daily load, comparison, and saved notes. Use it to review a completed or current week.",
  inputSchema: {
    type: "object",
    properties: { week: DAY },
    additionalProperties: false,
  },
  async run(ctx, input) {
    const selectedDay = input.week === undefined ? ctx.clock.today : assertDay(input.week, "week")
    const start = weekStart(selectedDay)
    const end = addDays(start, 6)
    const cutoff = ctx.clock.today < end ? ctx.clock.today : end
    const previousStart = addDays(start, -7)
    const previousEnd = addDays(cutoff, -7)
    const currentBounds = localDayBounds(ctx.clock, start, end)
    const previousBounds = localDayBounds(ctx.clock, previousStart, previousEnd)
    const [doneRecords, plannedRecords, previousDoneRecords, entryRecords, previousEntryRecords, ledgerRecords, previousLedgerRecords, routines, profile, notes, projectRecords] = await Promise.all([
      ctx.data.tasks({ statuses: ["done"], completedFrom: currentBounds.from, completedTo: currentBounds.to }),
      ctx.data.tasks({ plannedFrom: start, plannedTo: end }),
      ctx.data.tasks({ statuses: ["done"], completedFrom: previousBounds.from, completedTo: previousBounds.to }),
      ctx.data.entries({ from: currentBounds.from, to: currentBounds.to }),
      ctx.data.entries({ from: previousBounds.from, to: previousBounds.to }),
      ctx.data.ledger({ from: start, to: end }),
      ctx.data.ledger({ from: previousStart, to: previousEnd }),
      ctx.data.routines(),
      ctx.data.profile(),
      ctx.data.notes([start]),
      ctx.data.projects(),
    ])
    const doneTasks = values(doneRecords)
    const estimateTaskIds = [...new Set(doneTasks.map((task) => task.id))]
    const loggedByTask = estimateTaskIds.length > 0
      ? await sumEntryMinutesByTask(ctx.data, estimateTaskIds)
      : new Map<string, number>()
    const allEntries = new Map([
      ...values(entryRecords),
      ...values(previousEntryRecords),
    ].map((entry) => [entry.id, entry]))
    const allTasks = uniqueTasks(doneTasks, values(plannedRecords), values(previousDoneRecords))
    const wall = toWallWorkbench({
      profile: profile.value ?? undefined,
      projects: values(projectRecords),
      tasks: allTasks,
      entries: [...allEntries.values()],
      ledger: [...values(ledgerRecords), ...values(previousLedgerRecords)],
      routines: values(routines),
    }, ctx.clock)
    const review = weekReview(wall, start, ctx.clock.today)
    const accuracyTasks = review.done.filter((task) => task.estimateMin > 0)
    const estimate = accuracyTasks.reduce((sum, task) => sum + task.estimateMin, 0)
    const actual = accuracyTasks.reduce((sum, task) => sum + (loggedByTask.get(task.id) ?? 0), 0)
    review.accuracy = { estimate, actual, ratio: estimate > 0 ? actual / estimate : null }
    const present = presentationContext(ctx, projectRecords)
    const byProject = [...review.minutesByProject.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, minutes]) => ({ project: projectRef(id, present), minutes }))
    const notesValue = values(notes).find((note) => note.week === start)

    return {
      weekStart: review.start,
      weekEnd: review.end,
      doneCount: review.done.length,
      doneTasks: review.done.slice(0, DONE_LIMIT).map((task) => presentTask(task, present, loggedByTask.get(task.id) ?? 0)),
      doneTasksTruncated: review.done.length > DONE_LIMIT,
      minutes: review.minutes,
      minutesByProject: byProject,
      days: review.days,
      income: review.income,
      expense: review.expense,
      net: review.net,
      estimateAccuracy: review.accuracy,
      routines: review.routines,
      previous: review.previous,
      partial: review.partial,
      truncated: review.done.length > DONE_LIMIT,
      notes: notesValue ? { wins: notesValue.wins, improve: notesValue.improve, next: notesValue.next } : { wins: "", improve: "", next: "" },
    }
  },
}
