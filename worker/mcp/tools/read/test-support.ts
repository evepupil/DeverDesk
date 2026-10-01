import type { ActiveTimer, LedgerEntry, Profile, Project, Routine, Task, TimeEntry, WeekNote, WorkbenchData } from "../../../../src/domain/types"
import { createClock } from "../../clock"
import { createMemoryDataSource } from "../../data/memory"
import type { DataSource, ToolContext } from "../../types"

export const FIXED_NOW = Date.parse("2026-10-01T02:37:00.000Z")
export const FIXED_TODAY = "2026-10-01"

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Read tests",
    weekdayMin: 180,
    weekendMin: 240,
    dayStartHour: 8,
    dayEndHour: 18,
    timeZone: "Asia/Shanghai",
    currency: "CNY",
    ...overrides,
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    seq: 101,
    title: "Test task",
    projectId: null,
    status: "todo",
    priority: 2,
    estimateMin: 30,
    plannedFor: FIXED_TODAY,
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
    name: "Read project",
    color: "blue",
    stage: "running",
    goal: "Ship the project",
    startedOn: "2026-01-01",
    monthlyTarget: 1000,
    milestones: [],
    ...overrides,
  }
}

export function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r-1",
    title: "Daily review",
    cadence: "daily",
    estimateMin: 20,
    projectId: null,
    doneOn: [],
    createdOn: "2026-01-01",
    archived: false,
    ...overrides,
  }
}

export function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: "e-1",
    taskId: null,
    projectId: null,
    start: FIXED_NOW - 60_000,
    end: FIXED_NOW,
    ...overrides,
  }
}

export function makeLedger(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "l-1",
    kind: "income",
    amount: 20,
    projectId: null,
    category: "sales",
    channel: "bank",
    status: "received",
    date: FIXED_TODAY,
    expectedOn: null,
    note: "",
    createdAt: FIXED_NOW - 60_000,
    ...overrides,
  }
}

export function makeTimer(overrides: Partial<ActiveTimer> = {}): ActiveTimer {
  return { taskId: "t-1", projectId: null, label: "Test task", startedAt: FIXED_NOW - 5 * 60_000, ...overrides }
}

export function makeNote(overrides: Partial<WeekNote> = {}): WeekNote {
  return { week: "2026-09-28", wins: "", improve: "", next: "", ...overrides }
}

export function makeWorkbench(overrides: Partial<WorkbenchData> = {}): WorkbenchData {
  return {
    profile: makeProfile(),
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

export function toolContext(data: WorkbenchData, now = FIXED_NOW, source?: DataSource): ToolContext {
  let nextId = 0
  return {
    data: source ?? createMemoryDataSource(data),
    clock: createClock("Asia/Shanghai", now),
    token: { id: "read-test", name: "Read tests", tier: "read" },
    newId: (prefix) => `${prefix}-read-${++nextId}`,
  }
}
