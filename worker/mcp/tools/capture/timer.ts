import { closeTimer, startTimerOn } from "../../../../src/domain/operations"
import type { ActiveTimer, Project, Task, TimeEntry } from "../../../../src/domain/types"
import { structurallyEqual, createChange, singletonChange, updateChange } from "../shared/changes"
import { presentEntry, projectRef } from "../shared/present"
import { PROJECT_REF, REASON, TASK_REF } from "../shared/schema"
import { resolveProject } from "../shared/refs"
import type { PlannedChange, ToolContext, Versioned, WritePlan, WriteTool } from "../../types"
import { ToolInputError } from "../../types"
import { makePresentContext, operationContext, resolveCaptureTasks } from "./helpers"

interface TimerInput {
  action: "start" | "stop" | "status"
  task?: string
  label?: string
  project?: string | null
  reason?: string
}

function timerOutput(
  timer: ActiveTimer | null,
  ctx: ToolContext,
  projects: readonly Versioned<Project>[],
  tasks: ReadonlyMap<string, Task>
): Record<string, unknown> | null {
  if (!timer) return null
  const task = timer.taskId === null ? null : tasks.get(timer.taskId)
  return {
    task: task ? { id: task.id, code: `T-${task.seq}`, title: task.title } : timer.taskId === null ? null : { id: timer.taskId },
    project: projectRef(timer.projectId, makePresentContext(ctx.clock, projects)),
    label: timer.label,
    startedAt: ctx.clock.formatLocal(timer.startedAt),
    runningMin: Math.max(0, Math.round((ctx.clock.now - timer.startedAt) / 60_000)),
  }
}

export const timerTool: WriteTool<unknown> = {
  kind: "write",
  name: "timer",
  title: "Timer",
  description: "Start, stop, or inspect the active timer. Use it when the user wants to track work in real time; changes may be queued for the user's approval.",
  destructive: false,
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["start", "stop", "status"] },
      task: TASK_REF,
      label: { type: "string", minLength: 1, maxLength: 120 },
      project: PROJECT_REF,
      reason: REASON,
    },
    required: ["action"],
    additionalProperties: false,
  },
  async plan(ctx, value): Promise<WritePlan> {
    const input = value as TimerInput
    const current = await ctx.data.timer()
    const changes: PlannedChange[] = []
    let closedEntry: TimeEntry | null = null
    let nextTimer = current.value
    const taskVersions = input.action === "start" && input.task
      ? await resolveCaptureTasks(ctx.data, [input.task])
      : new Map<string, Versioned<Task>>()
    const targetVersion = input.task === undefined ? undefined : taskVersions.get(input.task)
    let targetTask = targetVersion?.value
    let projectVersions: Versioned<Project>[] = []
    let projectsLoaded = false

    if (input.action === "start") {
      if (targetTask && targetVersion) {
        const started = startTimerOn(current.value, targetTask, operationContext(ctx))
        nextTimer = started.timer
        targetTask = started.task
        closedEntry = started.closedEntry ? { ...started.closedEntry, origin: "ai" } : null
        if (!structurallyEqual(targetVersion.value, targetTask)) {
          changes.push(updateChange("task", targetTask.id, targetVersion, targetTask))
        }
      } else {
        const label = input.label?.trim()
        if (!label) throw new ToolInputError("Starting a timer without a task requires a non-empty label.")
        if (typeof input.project === "string") {
          projectVersions = await ctx.data.projects()
          projectsLoaded = true
        }
        const project = resolveProject(input.project, projectVersions)
        nextTimer = {
          taskId: null,
          projectId: project?.value.id ?? null,
          label,
          startedAt: ctx.clock.now,
        }
        const previous = closeTimer(current.value, ctx.clock.now, ctx.newId)
        closedEntry = previous ? { ...previous, origin: "ai" } : null
      }
      if (closedEntry) {
        const existing = await ctx.data.record("entry", closedEntry.id)
        changes.push(createChange("entry", closedEntry.id, closedEntry, existing))
      }
      const timerChange = singletonChange("timer", current, nextTimer)
      if (timerChange) changes.push(timerChange)
    } else if (input.action === "stop") {
      const stopped = closeTimer(current.value, ctx.clock.now, ctx.newId)
      closedEntry = stopped ? { ...stopped, origin: "ai" } : null
      if (closedEntry) {
        const existing = await ctx.data.record("entry", closedEntry.id)
        changes.push(createChange("entry", closedEntry.id, closedEntry, existing))
      }
      nextTimer = null
      const timerChange = singletonChange("timer", current, null)
      if (timerChange) changes.push(timerChange)
    }

    const projectIds = [current.value?.projectId ?? null, nextTimer?.projectId ?? null, closedEntry?.projectId ?? null]
    if (!projectsLoaded && projectIds.some((id) => id !== null)) {
      projectVersions = await ctx.data.projects()
    }
    const taskMap = new Map<string, Task>()
    if (targetTask) taskMap.set(targetTask.id, targetTask)
    const priorTaskId = current.value?.taskId
    if (priorTaskId !== null && priorTaskId !== undefined && !taskMap.has(priorTaskId)) {
      const prior = await ctx.data.tasks({ ids: [priorTaskId] })
      if (prior[0]) taskMap.set(prior[0].value.id, prior[0].value)
    }
    const present = makePresentContext(ctx.clock, projectVersions)
    return {
      changes,
      output: {
        action: input.action,
        timer: timerOutput(nextTimer, ctx, projectVersions, taskMap),
        closedEntry: closedEntry ? presentEntry(closedEntry, present, taskMap) : null,
      },
      reason: input.reason ?? null,
    }
  },
}
