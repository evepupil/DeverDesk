import { addMilestone, newProject, patchProject, removeMilestone, toggleMilestone, updateMilestone } from "../../../../src/domain/operations"
import {
  DIR_NAME_MAX_LENGTH,
  DIR_NAMES_MAX,
  dirNameKey,
  validateDirNames,
  type DirNamesError,
} from "../../../../src/domain/dir-names"
import type { Milestone, Project, ProjectStage, LabelColor } from "../../../../src/domain/types"
import { createChange, structurallyEqual, updateChange } from "../shared/changes"
import { presentProject } from "../shared/present"
import { assertDay } from "../shared/dates"
import { resolveProject } from "../shared/refs"
import { DAY, REASON } from "../shared/schema"
import { ToolInputError, type PlannedChange, type WriteTool } from "../../types"
import { assertOnlyKeys, inputObject, operationContext, optionalReason, requiredString } from "./helpers"

const COLORS: LabelColor[] = ["red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink", "gray"]
const STAGES: ProjectStage[] = ["idea", "building", "running", "paused", "ended"]
type Action = "create" | "update" | "add_milestone" | "update_milestone" | "complete_milestone" | "reopen_milestone" | "remove_milestone"

function directoryNames(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new ToolInputError(`Field "${field}" must be an array of directory names.`)
  }
  const result = validateDirNames(value, [], null)
  if (!result.ok) throw new ToolInputError(directoryError(result.error))
  return result.value
}

function directoryError(error: DirNamesError): string {
  switch (error.kind) {
    case "empty": return "Directory names cannot be empty."
    case "too-long": return `Directory name "${error.name}" exceeds ${DIR_NAME_MAX_LENGTH} characters.`
    case "bad-char": return `Directory name "${error.name}" cannot contain slash or backslash.`
    case "too-many": return `A project can have at most ${DIR_NAMES_MAX} directory names.`
    case "repeated": return `Directory name "${error.name}" is duplicated.`
    case "taken": return `Directory name "${error.name}" is already used by project "${error.projectName}".`
  }
}

function requestedDirectoryNames(
  input: Record<string, unknown>,
  current: readonly string[],
  projects: readonly Project[],
  selfId: string | null,
): string[] | undefined {
  const hasDirectories = "directories" in input || "addDirectories" in input || "removeDirectories" in input
  if (!hasDirectories) return undefined

  let names = "directories" in input ? directoryNames(input.directories, "directories") : [...current]
  if ("addDirectories" in input) {
    const existing = new Set(names.map(dirNameKey))
    const rawAdditions = input.addDirectories
    const pendingAdditions = Array.isArray(rawAdditions)
      ? rawAdditions.filter((name) => typeof name !== "string" || !existing.has(dirNameKey(name)))
      : rawAdditions
    const additions = directoryNames(pendingAdditions, "addDirectories")
    const seen = new Set(names.map(dirNameKey))
    for (const name of additions) {
      const key = dirNameKey(name)
      if (seen.has(key)) continue
      names.push(name)
      seen.add(key)
    }
  }
  if ("removeDirectories" in input) {
    const removed = new Set(directoryNames(input.removeDirectories, "removeDirectories").map(dirNameKey))
    names = names.filter((name) => !removed.has(dirNameKey(name)))
  }
  const result = validateDirNames(names, projects, selfId)
  if (!result.ok) throw new ToolInputError(directoryError(result.error))
  return result.value
}

function withDirectoryNames(project: Project, names: string[] | undefined): Project {
  if (names === undefined) return project
  const base = { ...project }
  delete base.dirNames
  return names.length === 0 ? base : { ...base, dirNames: names }
}

function milestoneFor(project: Project, ref: string): Milestone {
  const exactId = project.milestones.find((milestone) => milestone.id === ref)
  if (exactId) return exactId
  const matches = project.milestones.filter((milestone) => milestone.title.toLowerCase() === ref.trim().toLowerCase())
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new ToolInputError(`Ambiguous milestone reference "${ref}" on project "${project.name}".`)
  throw new ToolInputError(`Milestone "${ref}" was not found on project "${project.name}".`)
}

function parseAction(value: unknown): Action {
  if (typeof value !== "string" || !["create", "update", "add_milestone", "update_milestone", "complete_milestone", "reopen_milestone", "remove_milestone"].includes(value)) {
    throw new ToolInputError("Field \"action\" must be a supported project or milestone action.")
  }
  return value as Action
}

export const manageProjectTool: WriteTool<unknown> = {
  kind: "write",
  name: "manage_project",
  title: "Manage projects",
  description: "Create or update a project and manage its milestones using the same rules as DeverDesk. Use this when project details or milestones need to change; changes may be queued for the user's approval.",
  destructive: true,
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "update", "add_milestone", "update_milestone", "complete_milestone", "reopen_milestone", "remove_milestone"],
        description: "Required fields per action: create (name; optionally directories); update (project and at least one of name, color, stage, goal, monthlyTarget, directories, addDirectories or removeDirectories); add_milestone (project, title, due); update_milestone (project, milestone and at least one of title, due); complete_milestone, reopen_milestone and remove_milestone (project, milestone).",
      },
      project: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1, maxLength: 20 },
      color: { type: "string", enum: COLORS },
      stage: { type: "string", enum: STAGES },
      goal: { type: "string", maxLength: 2000 },
      monthlyTarget: { anyOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "null" }] },
      directories: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: DIR_NAME_MAX_LENGTH } },
      addDirectories: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: DIR_NAME_MAX_LENGTH } },
      removeDirectories: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: DIR_NAME_MAX_LENGTH } },
      milestone: { type: "string", minLength: 1, description: "Milestone reference: its id or exact title (case-insensitive), as listed in get_project under milestones.items." },
      title: { type: "string", minLength: 1, maxLength: 40 },
      due: DAY,
      reason: REASON,
    },
    required: ["action"], additionalProperties: false,
  },
  async plan(ctx, value) {
    const input = inputObject(value, "manage_project input")
    const action = parseAction(input.action)
    const directoryFields = action === "create" ? ["directories"] : action === "update" ? ["directories", "addDirectories", "removeDirectories"] : []
    const allowed = ["action", "reason", ...(action === "create" ? ["name", "color", "stage", "goal", "monthlyTarget"] : ["project"]), ...directoryFields]
    if (action === "add_milestone") allowed.push("title", "due")
    else if (action === "update_milestone") allowed.push("milestone", "title", "due")
    else if (action === "complete_milestone" || action === "reopen_milestone" || action === "remove_milestone") allowed.push("milestone")
    if (action === "update") allowed.push("name", "color", "stage", "goal", "monthlyTarget")
    assertOnlyKeys(input, allowed, action)
    if (action === "update" && !["name", "color", "stage", "goal", "monthlyTarget", "directories", "addDirectories", "removeDirectories"].some((field) => field in input)) {
      throw new ToolInputError('An update must include at least one field to change: "name", "color", "stage", "goal", or "monthlyTarget".')
    }
    if (action === "update_milestone" && !("title" in input) && !("due" in input)) {
      throw new ToolInputError('A milestone update must include "title" or "due".')
    }

    const projects = await ctx.data.projects()
    const projectValues = projects.map(({ value }) => value)
    const op = operationContext(ctx)
    const changes: PlannedChange[] = []
    let after: Project
    let changedMilestone: Milestone | null = null

    if (action === "create") {
      const name = requiredString(input.name, "name")
      if (name.trim().length > 20) throw new ToolInputError('Field "name" must be at most 20 characters.')
      const color = input.color ?? "blue"
      const stage = input.stage ?? "idea"
      if (!COLORS.includes(color as LabelColor)) throw new ToolInputError('Field "color" must be a supported label color.')
      if (!STAGES.includes(stage as ProjectStage)) throw new ToolInputError('Field "stage" must be a supported project stage.')
      const goal = input.goal ?? ""
      if (typeof goal !== "string" || goal.length > 2000) throw new ToolInputError('Field "goal" must be a string of at most 2000 characters.')
      const monthlyTarget = input.monthlyTarget === undefined ? null : input.monthlyTarget
      if (monthlyTarget !== null && (typeof monthlyTarget !== "number" || !Number.isFinite(monthlyTarget) || monthlyTarget <= 0)) {
        throw new ToolInputError('Field "monthlyTarget" must be a positive number or null.')
      }
      after = withDirectoryNames(
        newProject({ name, color: color as LabelColor, stage: stage as ProjectStage, goal, monthlyTarget }, op),
        requestedDirectoryNames(input, [], projectValues, null),
      )
      changes.push(createChange("project", after.id, after))
    } else {
      const projectVersion = resolveProject(requiredString(input.project, "project"), projects)
      if (!projectVersion) throw new ToolInputError('Field "project" must resolve to a project.')
      const project = projectVersion.value
      if (action === "update") {
        const name = input.name === undefined ? project.name : requiredString(input.name, "name")
        if (name.trim().length > 20) throw new ToolInputError('Field "name" must be at most 20 characters.')
        const color = input.color === undefined ? project.color : input.color
        const stage = input.stage === undefined ? project.stage : input.stage
        const goal = input.goal === undefined ? project.goal : input.goal
        const monthlyTarget = input.monthlyTarget === undefined ? project.monthlyTarget : input.monthlyTarget
        if (!COLORS.includes(color as LabelColor)) throw new ToolInputError('Field "color" must be a supported label color.')
        if (!STAGES.includes(stage as ProjectStage)) throw new ToolInputError('Field "stage" must be a supported project stage.')
        if (typeof goal !== "string" || goal.length > 2000) throw new ToolInputError('Field "goal" must be a string of at most 2000 characters.')
        if (monthlyTarget !== null && (typeof monthlyTarget !== "number" || !Number.isFinite(monthlyTarget) || monthlyTarget <= 0)) {
          throw new ToolInputError('Field "monthlyTarget" must be a positive number or null.')
        }
        after = withDirectoryNames(
          patchProject(project, { name, color: color as LabelColor, stage: stage as ProjectStage, goal, monthlyTarget: monthlyTarget as number | null }),
          requestedDirectoryNames(input, project.dirNames ?? [], projectValues, project.id),
        )
      } else {
        const milestoneRef = action === "add_milestone" ? null : requiredString(input.milestone, "milestone")
        const milestone = milestoneRef === null ? null : milestoneFor(project, milestoneRef)
        if (action === "add_milestone") {
          const title = requiredString(input.title, "title")
          if (title.trim().length > 40) throw new ToolInputError('Field "title" must be at most 40 characters.')
          const due = assertDay(requiredString(input.due, "due"), "due")
          after = addMilestone(project, title, due, op)
          changedMilestone = after.milestones.find((item) => !project.milestones.some((existing) => existing.id === item.id)) ?? null
        } else if (action === "update_milestone") {
          const patch: Partial<Pick<Milestone, "title" | "due">> = {}
          if (input.title !== undefined) {
            patch.title = requiredString(input.title, "title")
            if (patch.title.trim().length > 40) throw new ToolInputError('Field "title" must be at most 40 characters.')
          }
          if (input.due !== undefined) patch.due = assertDay(requiredString(input.due, "due"), "due")
          after = updateMilestone(project, milestone!.id, patch)
          changedMilestone = after.milestones.find((item) => item.id === milestone!.id) ?? null
        } else if (action === "remove_milestone") {
          after = removeMilestone(project, milestone!.id)
        } else {
          const shouldComplete = action === "complete_milestone"
          const isComplete = milestone!.doneOn !== null
          after = isComplete === shouldComplete ? project : toggleMilestone(project, milestone!.id, op)
          changedMilestone = after.milestones.find((item) => item.id === milestone!.id) ?? null
        }
      }
      if (!structurallyEqual(project, after)) changes.push(updateChange("project", project.id, projectVersion, after))
    }
    return {
      changes,
      reason: optionalReason(input),
      output: {
        action,
        project: presentProject(after),
        milestone: changedMilestone,
        changed: changes.length > 0,
      },
    }
  },
}
