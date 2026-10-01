import { addDays } from "../../../../src/domain/calendar"
import { minutesOf } from "../../../../src/domain/tasks"
import type { DayKey, Project, Task, TimeEntry } from "../../../../src/domain/types"
import { createChange } from "../shared/changes"
import { presentEntry } from "../shared/present"
import { DAY, PROJECT_REF, REASON, TASK_REF } from "../shared/schema"
import { resolveProject } from "../shared/refs"
import type { PlannedChange, Versioned, WritePlan, WriteTool } from "../../types"
import { ToolInputError } from "../../types"
import { makePresentContext, parseLocalDateTime, resolveCaptureTasks } from "./helpers"

const LOCAL_ENTRY_TIME = {
  type: "string",
  pattern: "^(?:\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d|(?:[01]\\d|2[0-3]):[0-5]\\d)$",
  description: "Local date and time (YYYY-MM-DDTHH:mm) or a local time of day (HH:mm).",
} as const

interface LogTimeInputEntry {
  start: string
  end?: string
  minutes?: number
  date?: DayKey
  task?: string
  project?: string | null
}

interface LogTimeInput {
  entries: LogTimeInputEntry[]
  reason?: string
}

export const logTimeTool: WriteTool<unknown> = {
  kind: "write",
  name: "log_time",
  title: "Log time",
  description: "Add one or more time entries for completed work. Use it when the user wants to record past effort; changes may be queued for the user's approval.",
  destructive: false,
  inputSchema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            start: LOCAL_ENTRY_TIME,
            end: { ...LOCAL_ENTRY_TIME, description: `${LOCAL_ENTRY_TIME.description} Give either end or minutes, not both.` },
            minutes: { type: "integer", minimum: 1, maximum: 1440, description: "Duration in minutes. Give either minutes or end, not both." },
            date: DAY,
            task: TASK_REF,
            project: PROJECT_REF,
          },
          required: ["start"],
          additionalProperties: false,
        },
      },
      reason: REASON,
    },
    required: ["entries"],
    additionalProperties: false,
  },
  async plan(ctx, value): Promise<WritePlan> {
    const input = value as LogTimeInput
    const refs = [...new Set(input.entries.flatMap((entry) => entry.task ? [entry.task] : []))]
    const tasks = await resolveCaptureTasks(ctx.data, refs)
    const projectRefs = input.entries.filter((entry) => !entry.task && typeof entry.project === "string")
    const projects = projectRefs.length > 0 ? await ctx.data.projects() : []
    const records: Array<{ index: number; value: TimeEntry }> = []
    const changes: PlannedChange[] = []

    for (const [index, candidate] of input.entries.entries()) {
      if ((candidate.end === undefined) === (candidate.minutes === undefined)) {
        const given = candidate.end === undefined ? "neither was given" : "both were given"
        throw new ToolInputError(`entries[${index}] must provide exactly one of "end" or "minutes" (${given}).`)
      }
      const start = parseLocalDateTime(ctx, candidate.start, candidate.date, `entries[${index}].start`)
      const startDay = ctx.clock.dayOf(start)
      let end: number
      if (candidate.minutes !== undefined) {
        end = start + candidate.minutes * 60_000
      } else {
        const endInput = candidate.end as string
        end = parseLocalDateTime(ctx, endInput, candidate.date ?? startDay, `entries[${index}].end`)
        if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endInput) && end <= start) {
          end = parseLocalDateTime(ctx, endInput, addDays(startDay, 1), `entries[${index}].end`)
        }
      }
      const duration = end - start
      if (duration <= 0) throw new ToolInputError(`entries[${index}].end must be later than start.`)
      if (duration > 24 * 60 * 60_000) throw new ToolInputError(`entries[${index}] cannot be longer than 24 hours.`)
      if (end > ctx.clock.now) throw new ToolInputError(`entries[${index}].end cannot be in the future.`)

      const taskVersion = candidate.task === undefined ? undefined : tasks.get(candidate.task)
      const resolvedProject = taskVersion ? undefined : resolveProject(candidate.project, projects)
      const entry: TimeEntry = {
        id: ctx.newId("E"),
        taskId: taskVersion?.value.id ?? null,
        projectId: taskVersion ? taskVersion.value.projectId : resolvedProject?.value.id ?? null,
        start,
        end,
        origin: "ai",
      }
      const existing = await ctx.data.record("entry", entry.id)
      changes.push(createChange("entry", entry.id, entry, existing))
      records.push({ index, value: entry })
    }

    const projectIds = records.map(({ value: entry }) => entry.projectId)
    let projectsForPresent: Versioned<Project>[] = projects
    if (projectIds.some((id) => id !== null && !projects.some((project) => project.value.id === id))) {
      projectsForPresent = await ctx.data.projects()
    }
    const taskMap = new Map<string, Task>([...tasks.values()].map((version) => [version.value.id, version.value]))
    const present = makePresentContext(ctx.clock, projectsForPresent)
    const outputEntries = records.map(({ value: entry }) => ({
      ...presentEntry(entry, present, taskMap),
      minutes: minutesOf(entry),
    }))

    return {
      changes,
      output: { created: outputEntries },
      reason: input.reason ?? null,
    }
  },
}
