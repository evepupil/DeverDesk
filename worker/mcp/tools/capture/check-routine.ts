import { isDone, toggleDone } from "../../../../src/domain/routines"
import type { DayKey, Project } from "../../../../src/domain/types"
import { updateChange } from "../shared/changes"
import { presentRoutine } from "../shared/present"
import { DAY, REASON, ROUTINE_REF } from "../shared/schema"
import { assertDay } from "../shared/dates"
import { resolveRoutine } from "../shared/refs"
import type { PlannedChange, Versioned, WritePlan, WriteTool } from "../../types"
import { makePresentContext } from "./helpers"

interface CheckRoutineInput {
  routine: string
  date?: DayKey
  done?: boolean
  reason?: string
}

export const checkRoutineTool: WriteTool<unknown> = {
  kind: "write",
  name: "check_routine",
  title: "Check routine",
  description: "Mark a routine as done or undone for a selected date. Use it when the user wants to record a routine check-in; changes may be queued for the user's approval.",
  destructive: false,
  inputSchema: {
    type: "object",
    properties: {
      routine: ROUTINE_REF,
      date: DAY,
      done: { type: "boolean", default: true },
      reason: REASON,
    },
    required: ["routine"],
    additionalProperties: false,
  },
  async plan(ctx, value): Promise<WritePlan> {
    const input = value as CheckRoutineInput
    const date = input.date ?? ctx.clock.today
    assertDay(date, "date")
    const routines = await ctx.data.routines()
    const current = resolveRoutine(input.routine, routines)
    const done = input.done ?? true
    const changes: PlannedChange[] = []
    let after = current.value

    if (isDone(current.value, date) !== done) {
      after = toggleDone(current.value, date)
      changes.push(updateChange("routine", current.value.id, current, after))
    }

    const projects: Versioned<Project>[] = current.value.projectId === null ? [] : await ctx.data.projects()
    return {
      changes,
      output: {
        routine: presentRoutine(after, makePresentContext(ctx.clock, projects)),
        date,
        done,
      },
      reason: input.reason ?? null,
    }
  },
}
