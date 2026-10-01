import { archiveRoutine, newRoutine, patchRoutine, restoreRoutine } from "../../../../src/domain/operations"
import type { Cadence, Routine } from "../../../../src/domain/types"
import { structurallyEqual, updateChange, createChange } from "../shared/changes"
import { presentRoutine } from "../shared/present"
import { resolveProject, resolveRoutine } from "../shared/refs"
import { PROJECT_REF, REASON, ROUTINE_REF } from "../shared/schema"
import { ToolInputError, type PlannedChange, type WriteTool } from "../../types"
import { assertOnlyKeys, inputObject, operationContext, optionalReason, presentContext, requiredString } from "./helpers"

const CADENCES: Cadence[] = ["daily", "weekdays", "weekly", "monthly"]
type Action = "create" | "update" | "archive" | "unarchive"

export const manageRoutineTool: WriteTool<unknown> = {
  kind: "write",
  name: "manage_routine",
  title: "Manage routines",
  description: "Create, update, archive, or restore a routine using the same rules as DeverDesk. Use this when a recurring activity or its schedule needs to change; changes may be queued for the user's approval.",
  destructive: true,
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "update", "archive", "unarchive"],
        description: "Required fields per action: create (title); update (routine and at least one of title, cadence, estimateMin, project); archive and unarchive (routine).",
      },
      routine: ROUTINE_REF,
      title: { type: "string", minLength: 1, maxLength: 40 },
      cadence: { type: "string", enum: CADENCES },
      estimateMin: { type: "integer", minimum: 0, maximum: 1440 },
      project: PROJECT_REF,
      reason: REASON,
    },
    required: ["action"], additionalProperties: false,
  },
  async plan(ctx, value) {
    const input = inputObject(value, "manage_routine input")
    if (typeof input.action !== "string" || !["create", "update", "archive", "unarchive"].includes(input.action)) {
      throw new ToolInputError('Field "action" must be create, update, archive, or unarchive.')
    }
    const action = input.action as Action
    const allowed = action === "create"
      ? ["action", "reason", "title", "cadence", "estimateMin", "project"]
      : action === "update"
        ? ["action", "reason", "routine", "title", "cadence", "estimateMin", "project"]
        : ["action", "reason", "routine"]
    assertOnlyKeys(input, allowed, action)
    if (action === "update" && !["title", "cadence", "estimateMin", "project"].some((field) => field in input)) {
      throw new ToolInputError('An update must include at least one field to change: "title", "cadence", "estimateMin", or "project".')
    }
    if (input.project !== undefined && input.project !== null && typeof input.project !== "string") {
      throw new ToolInputError('Field "project" must be a project reference or null.')
    }
    const routines = await ctx.data.routines()
    const projects = await ctx.data.projects()
    const op = operationContext(ctx)
    const changes: PlannedChange[] = []
    let after: Routine
    if (action === "create") {
      const title = requiredString(input.title, "title")
      if (title.trim().length > 40) throw new ToolInputError('Field "title" must be at most 40 characters.')
      const cadence = input.cadence ?? "daily"
      if (!CADENCES.includes(cadence as Cadence)) throw new ToolInputError('Field "cadence" must be daily, weekdays, weekly, or monthly.')
      const estimateMin = input.estimateMin ?? 30
      if (!Number.isInteger(estimateMin) || (estimateMin as number) < 0 || (estimateMin as number) > 1440) throw new ToolInputError('Field "estimateMin" must be an integer from 0 to 1440.')
      const projectId = input.project === undefined ? null : resolveProject(input.project as string | null, projects)?.value.id ?? null
      after = newRoutine({ title, cadence: cadence as Cadence, estimateMin: estimateMin as number, projectId }, op)
      changes.push(createChange("routine", after.id, after))
    } else {
      const routineVersion = resolveRoutine(requiredString(input.routine, "routine"), routines)
      const routine = routineVersion.value
      if (action === "update") {
        const title = input.title === undefined ? routine.title : requiredString(input.title, "title")
        if (title.trim().length > 40) throw new ToolInputError('Field "title" must be at most 40 characters.')
        const cadence = input.cadence === undefined ? routine.cadence : input.cadence
        if (!CADENCES.includes(cadence as Cadence)) throw new ToolInputError('Field "cadence" must be daily, weekdays, weekly, or monthly.')
        const estimateMin = input.estimateMin === undefined ? routine.estimateMin : input.estimateMin
        if (!Number.isInteger(estimateMin) || (estimateMin as number) < 0 || (estimateMin as number) > 1440) throw new ToolInputError('Field "estimateMin" must be an integer from 0 to 1440.')
        const projectId = input.project === undefined ? routine.projectId : resolveProject(input.project as string | null, projects)?.value.id ?? null
        after = patchRoutine(routine, { title, cadence: cadence as Cadence, estimateMin: estimateMin as number, projectId })
      } else {
        after = action === "archive" ? archiveRoutine(routine) : restoreRoutine(routine)
      }
      if (!structurallyEqual(routine, after)) changes.push(updateChange("routine", routine.id, routineVersion, after))
    }
    return {
      changes,
      reason: optionalReason(input),
      output: {
        action,
        routine: presentRoutine(after, presentContext(ctx, projects)),
        changed: changes.length > 0,
      },
    }
  },
}
