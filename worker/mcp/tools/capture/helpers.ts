import type { DayKey, Project, Task, WorkbenchData } from "../../../../src/domain/types"
import { assertDay, assertTime } from "../shared/dates"
import { resolveProject, resolveTasks } from "../shared/refs"
import type { PresentContext } from "../shared/present"
import type { Clock, DataSource, TaskQuery, ToolContext, Versioned } from "../../types"
import { ToolInputError } from "../../types"
import type { OpContext } from "../../../../src/domain/operations"

export function operationContext(ctx: ToolContext): OpContext {
  return { now: ctx.clock.now, today: ctx.clock.today, newId: ctx.newId }
}

export function resolveProjectId(
  ref: string | null | undefined,
  projects: readonly Versioned<Project>[]
): string | null {
  return resolveProject(ref, projects)?.value.id ?? null
}

export function makePresentContext(clock: Clock, projects: readonly Versioned<Project>[]): PresentContext {
  return {
    clock,
    projects: new Map(projects.map(({ value }) => [value.id, value])),
  }
}

export async function resolveCaptureTasks(data: DataSource, refs: readonly string[]): Promise<Map<string, Versioned<Task>>> {
  const resolverData: DataSource = {
    ...data,
    async tasks(query: TaskQuery) {
      const ids = query.ids?.length ? query.ids : undefined
      const seqs = query.seqs?.length ? query.seqs : undefined
      // DataSource 条件是并且，resolver 则按内部编号或显示编号查；空数组也不能当成筛选条件。
      if (ids && seqs) {
        const [byId, bySeq] = await Promise.all([data.tasks({ ids }), data.tasks({ seqs })])
        return [...new Map([...byId, ...bySeq].map((record) => [record.value.id, record])).values()]
      }
      return data.tasks({ ...query, ids, seqs })
    },
  }
  return resolveTasks(resolverData, refs)
}

export function parseLocalDateTime(
  ctx: ToolContext,
  value: string,
  date: DayKey | undefined,
  field: string
): number {
  let effectiveDate = date ?? ctx.clock.today
  const fullMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value)
  if (fullMatch) {
    effectiveDate = assertDay(fullMatch[1], field)
    assertTime(fullMatch[2], field)
  } else {
    assertTime(value, field)
  }

  const local = ctx.clock.parseLocal(value, effectiveDate)
  if (local === null) {
    throw new ToolInputError(`Invalid local date and time for "${field}".`)
  }
  return local
}

export function emptyWorkbench(overrides: Partial<WorkbenchData> = {}): WorkbenchData {
  return {
    profile: {
      name: "Test",
      weekdayMin: 180,
      weekendMin: 240,
      dayStartHour: 8,
      dayEndHour: 22,
      timeZone: "Asia/Shanghai",
    },
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
