import type {
  ActiveTimer,
  LedgerEntry,
  Profile,
  Project,
  Routine,
  Task,
  TimeEntry,
  WeekNote,
  WorkbenchData,
} from "../../../src/domain/types"
import type { Clock } from "../types"

export interface WorkbenchParts {
  profile?: Profile
  projects?: Project[]
  tasks?: Task[]
  entries?: TimeEntry[]
  ledger?: LedgerEntry[]
  routines?: Routine[]
  notes?: WeekNote[]
  timer?: ActiveTimer | null
}

export const DEFAULT_PROFILE: Profile = {
  name: "",
  weekdayMin: 180,
  weekendMin: 360,
  dayStartHour: 8,
  dayEndHour: 24,
}

function wallTimestamp(ms: number, clock: Clock): number {
  return clock.toWall(ms)
}

export function toWallWorkbench(parts: WorkbenchParts, clock: Clock): WorkbenchData {
  const tasks = (parts.tasks ?? []).map((task) => ({
    ...task,
    createdAt: wallTimestamp(task.createdAt, clock),
    completedAt: task.completedAt === null ? null : wallTimestamp(task.completedAt, clock),
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
  }))
  const entries = (parts.entries ?? []).map((entry) => {
    const offset = clock.toWall(entry.start) - entry.start
    return { ...entry, start: entry.start + offset, end: entry.end + offset }
  })
  const ledger = (parts.ledger ?? []).map((entry) => ({
    ...entry,
    createdAt: wallTimestamp(entry.createdAt, clock),
  }))
  const projects = (parts.projects ?? []).map((project) => ({
    ...project,
    milestones: project.milestones.map((milestone) => ({ ...milestone })),
  }))
  const routines = (parts.routines ?? []).map((routine) => ({ ...routine, doneOn: [...routine.doneOn] }))
  const notes = (parts.notes ?? []).map((note) => ({ ...note }))
  const timer = parts.timer == null
    ? null
    : { ...parts.timer, startedAt: wallTimestamp(parts.timer.startedAt, clock) }

  return {
    profile: { ...(parts.profile ?? DEFAULT_PROFILE) },
    projects,
    tasks,
    entries,
    ledger,
    routines,
    notes,
    timer,
  }
}
