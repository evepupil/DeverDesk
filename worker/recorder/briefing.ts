import type { BriefingResponse, BriefingTask } from "../../src/sync/recorder-protocol"
import { findProjectByDir } from "../../src/domain/dir-names"
import type { Task } from "../../src/domain/types"
import { createClock } from "../mcp/clock"
import type { DataSource } from "../mcp/types"

const OPEN_STATUSES = ["backlog", "todo", "doing"] as const

interface BriefingMore {
  plannedToday: number
  overdue: number
  open: number
}

type RecorderBriefing = BriefingResponse & { more?: BriefingMore }

function priority(task: Task): number {
  return task.priority === 0 ? -1 : task.priority
}

function byOpenOrder(a: Task, b: Task): number {
  return priority(b) - priority(a) ||
    (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") ||
    a.seq - b.seq || a.id.localeCompare(b.id)
}

function presentTask(task: Task): BriefingTask {
  return {
    code: `T-${task.seq}`,
    title: task.title,
    status: task.status,
    priority: task.priority,
    estimateMin: task.estimateMin,
    plannedFor: task.plannedFor,
    dueOn: task.dueOn,
  }
}

export async function getRecorderBriefing(
  data: DataSource,
  dir: string,
  now: number,
): Promise<RecorderBriefing | null> {
  const [projects, profile] = await Promise.all([data.projects(), data.profile()])
  const project = findProjectByDir(projects.map(({ value }) => value), dir)
  const clock = createClock(profile.value?.timeZone, now)
  const response: RecorderBriefing = {
    bound: Boolean(project),
    today: clock.today,
    plannedToday: [],
    overdue: [],
    open: [],
  }
  if (!project) return response

  const tasks = (await data.tasks({ projectId: project.id, statuses: [...OPEN_STATUSES] })).map(({ value }) => value)
  const planned = tasks.filter((task) => task.plannedFor === clock.today).sort((a, b) => a.seq - b.seq)
  const overdue = tasks.filter((task) => task.plannedFor !== clock.today && (
    (task.dueOn !== null && task.dueOn < clock.today) ||
    ((task.status === "todo" || task.status === "doing") && task.plannedFor !== null && task.plannedFor < clock.today)
  )).sort(byOpenOrder)
  const excluded = new Set([...planned.slice(0, 10), ...overdue.slice(0, 5)].map((task) => task.id))
  const open = tasks.filter((task) => !excluded.has(task.id) && task.plannedFor !== clock.today &&
    !((task.dueOn !== null && task.dueOn < clock.today) ||
      ((task.status === "todo" || task.status === "doing") && task.plannedFor !== null && task.plannedFor < clock.today)))
    .sort(byOpenOrder)

  const displayedPlanned = planned.slice(0, 10)
  const displayedOverdue = overdue.slice(0, 5)
  const displayedOpen = open.slice(0, 15)
  response.project = { id: project.id, name: project.name, stage: project.stage }
  response.plannedToday = displayedPlanned.map(presentTask)
  response.overdue = displayedOverdue.map(presentTask)
  response.open = displayedOpen.map(presentTask)
  response.more = {
    plannedToday: planned.length - displayedPlanned.length,
    overdue: overdue.length - displayedOverdue.length,
    open: open.length - displayedOpen.length,
  }
  return response
}

