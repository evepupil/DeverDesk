import type { Routine } from "../types"
import type { OpContext } from "./context"

export type RoutineInput = Pick<Routine, "title" | "cadence" | "estimateMin" | "projectId">

export function newRoutine(input: RoutineInput, ctx: OpContext): Routine {
  return {
    ...input,
    title: input.title.trim(),
    id: ctx.newId("r"),
    doneOn: [],
    createdOn: ctx.today,
    archived: false,
  }
}

export function patchRoutine(routine: Routine, input: RoutineInput): Routine {
  return { ...routine, ...input, title: input.title.trim() }
}

export function archiveRoutine(routine: Routine): Routine {
  return { ...routine, archived: true }
}

export function restoreRoutine(routine: Routine): Routine {
  return { ...routine, archived: false }
}
