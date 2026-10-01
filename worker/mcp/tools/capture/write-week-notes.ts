import { weekStart } from "../../../../src/domain/calendar"
import { patchNote } from "../../../../src/domain/operations"
import type { DayKey, WeekNote } from "../../../../src/domain/types"
import { structurallyEqual, createChange, updateChange } from "../shared/changes"
import { DAY, NOTES, REASON } from "../shared/schema"
import { assertDay } from "../shared/dates"
import type { PlannedChange, Versioned, WritePlan, WriteTool } from "../../types"

interface WriteWeekNotesInput {
  week?: DayKey
  wins?: string
  improve?: string
  next?: string
  mode?: "replace" | "append"
  reason?: string
}

function appendNote(current: string, addition: string): string {
  if (addition.length === 0) return current
  return current.length === 0 ? addition : `${current}\n${addition}`
}

export const writeWeekNotesTool: WriteTool<unknown> = {
  kind: "write",
  name: "write_week_notes",
  title: "Write week notes",
  description: "Write or append to a week's review notes. Use it when the user wants to capture wins, improvements, or next steps; changes may be queued for the user's approval.",
  destructive: false,
  inputSchema: {
    type: "object",
    properties: {
      week: DAY,
      wins: NOTES,
      improve: NOTES,
      next: NOTES,
      mode: { type: "string", enum: ["replace", "append"], default: "replace" },
      reason: REASON,
    },
    additionalProperties: false,
  },
  async plan(ctx, value): Promise<WritePlan> {
    const input = value as WriteWeekNotesInput
    const selectedDay = input.week ?? ctx.clock.today
    assertDay(selectedDay, "week")
    const week = weekStart(selectedDay)
    const current = (await ctx.data.notes([week]))[0] as Versioned<WeekNote> | undefined
    const mode = input.mode ?? "replace"
    const patch: Partial<Omit<WeekNote, "week">> = {}
    for (const field of ["wins", "improve", "next"] as const) {
      const supplied = input[field]
      if (supplied === undefined) continue
      patch[field] = mode === "append"
        ? appendNote(current?.value[field] ?? "", supplied)
        : supplied
    }

    const changes: PlannedChange[] = []
    let after = current?.value ?? { week, wins: "", improve: "", next: "" }
    if (Object.keys(patch).length > 0) {
      after = patchNote(current?.value ?? null, week, patch)
      if (!current || !structurallyEqual(current.value, after)) {
        if (current) {
          changes.push(updateChange("note", week, current, after))
        } else {
          const existing = await ctx.data.record("note", week)
          changes.push(createChange("note", week, after, existing))
        }
      }
    }

    return {
      changes,
      output: { ...after },
      reason: input.reason ?? null,
    }
  },
}
