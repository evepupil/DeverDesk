import type { ActiveTimer, LedgerEntry, Profile, Project, Routine, Task, TimeEntry, WorkbenchData } from "../../../../src/domain/types"
import { createClock } from "../../clock"
import { createMemoryDataSource, type MemoryDataSourceOptions } from "../../data/memory"
import type { ToolContext } from "../../types"

export const FIXED_NOW = Date.parse("2026-10-01T02:37:00.000Z")
export const FIXED_TODAY = "2026-10-01"

export function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Test",
    weekdayMin: 180,
    weekendMin: 240,
    dayStartHour: 8,
    dayEndHour: 18,
    timeZone: "Asia/Shanghai",
    ...overrides,
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    seq: 101,
    title: "Task",
    projectId: null,
    status: "todo",
    priority: 2,
    estimateMin: 30,
    plannedFor: null,
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: FIXED_NOW - 86_400_000,
    completedAt: null,
    ...overrides,
  }
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    name: "Project",
    color: "blue",
    stage: "running",
    goal: "",
    startedOn: "2026-01-01",
    monthlyTarget: null,
    milestones: [],
    ...overrides,
  }
}

export function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r-1",
    title: "Routine",
    cadence: "daily",
    estimateMin: 30,
    projectId: null,
    doneOn: [],
    createdOn: "2026-01-01",
    archived: false,
    ...overrides,
  }
}

export function makeTimer(overrides: Partial<ActiveTimer> = {}): ActiveTimer {
  return { taskId: "t-1", projectId: null, label: "Task", startedAt: FIXED_NOW - 5 * 60_000, ...overrides }
}

export function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return { id: "e-1", taskId: null, projectId: null, start: FIXED_NOW - 60_000, end: FIXED_NOW, ...overrides }
}

export function makeLedger(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "l-1", kind: "income", amount: 20, projectId: null, category: "sales", channel: "bank",
    status: "received", date: FIXED_TODAY, expectedOn: null, note: "", createdAt: FIXED_NOW - 60_000,
    ...overrides,
  }
}

export function makeData(overrides: Partial<WorkbenchData> = {}): WorkbenchData {
  return {
    profile: baseProfile(),
    projects: [],
    tasks: [],
    entries: [],
    ledger: [],
    routines: [],
    notes: [],
    timer: null,
    ...overrides,
  }
}

export function toolContext(data: WorkbenchData, options: MemoryDataSourceOptions = {}): ToolContext {
  let next = 0
  return {
    data: createMemoryDataSource(data, options),
    clock: createClock("Asia/Shanghai", FIXED_NOW),
    token: { id: "token-1", name: "Test token", tier: "write" },
    newId(prefix) {
      next += 1
      return `${prefix}-generated-${next}`
    },
  }
}

export const fixedNow = FIXED_NOW
