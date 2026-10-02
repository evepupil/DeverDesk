import type { DayKey, Milestone, Project } from "../types"
import type { OpContext } from "./context"

export type ProjectInput = Pick<Project, "name" | "color" | "stage" | "goal" | "monthlyTarget" | "dirNames">

export function newProject(input: ProjectInput, ctx: OpContext): Project {
  const { dirNames, ...fields } = input
  return {
    ...fields,
    name: input.name.trim(),
    id: ctx.newId("p"),
    startedOn: ctx.today,
    milestones: [],
    dirNames: (dirNames ?? []).map((name) => name.trim()),
  }
}

export function patchProject(project: Project, input: ProjectInput): Project {
  const { dirNames, ...fields } = input
  return {
    ...project,
    ...fields,
    ...(dirNames === undefined ? {} : { dirNames: dirNames.map((name) => name.trim()) }),
    name: input.name.trim(),
  }
}

export function toggleMilestone(project: Project, milestoneId: string, ctx: OpContext): Project {
  return {
    ...project,
    milestones: project.milestones.map((milestone) =>
      milestone.id === milestoneId
        ? { ...milestone, doneOn: milestone.doneOn ? null : ctx.today }
        : milestone
    ),
  }
}

export function addMilestone(project: Project, title: string, due: DayKey, ctx: OpContext): Project {
  const milestone: Milestone = { id: ctx.newId("M"), title: title.trim(), due, doneOn: null }
  return { ...project, milestones: [...project.milestones, milestone].sort((a, b) => a.due.localeCompare(b.due)) }
}

export function updateMilestone(
  project: Project,
  milestoneId: string,
  patch: Partial<Pick<Milestone, "title" | "due">>
): Project {
  const milestones = project.milestones.map((milestone) =>
    milestone.id === milestoneId
      ? { ...milestone, ...patch, title: patch.title === undefined ? milestone.title : patch.title.trim() }
      : milestone
  )
  return { ...project, milestones: milestones.sort((a, b) => a.due.localeCompare(b.due)) }
}

export function removeMilestone(project: Project, milestoneId: string): Project {
  return { ...project, milestones: project.milestones.filter((milestone) => milestone.id !== milestoneId) }
}
