import { dayStartMs } from "./calendar"
import type { WorkbenchData } from "./types"

/** 动态流：从任务、收支和里程碑推导，不单独存 */

export type EventKind = "done" | "income" | "expense" | "refund" | "milestone"

export interface WorkbenchEvent {
  id: string
  at: number
  kind: EventKind
  title: string
  projectId: string | null
  taskId?: string
  entryId?: string
}

export function deriveEvents(data: WorkbenchData): WorkbenchEvent[] {
  const events: WorkbenchEvent[] = []

  for (const task of data.tasks) {
    if (task.status === "done" && task.completedAt) {
      events.push({
        id: `done-${task.id}`,
        at: task.completedAt,
        kind: "done",
        title: task.title,
        projectId: task.projectId,
        taskId: task.id,
      })
    }
  }

  for (const entry of data.ledger) {
    if (entry.status === "pending") continue
    // 手动记的账用记录时间；样例数据按那天中午计
    const at = entry.createdAt > dayStartMs(entry.date) ? entry.createdAt : dayStartMs(entry.date) + 12 * 3_600_000
    events.push({
      id: `ledger-${entry.id}`,
      at,
      kind: entry.status === "refunded" ? "refund" : entry.kind,
      title: entry.note,
      projectId: entry.projectId,
      entryId: entry.id,
    })
  }

  for (const project of data.projects) {
    for (const milestone of project.milestones) {
      if (!milestone.doneOn) continue
      events.push({
        id: `milestone-${milestone.id}`,
        at: dayStartMs(milestone.doneOn) + 18 * 3_600_000,
        kind: "milestone",
        title: milestone.title,
        projectId: project.id,
      })
    }
  }

  return events.sort((a, b) => b.at - a.at)
}
