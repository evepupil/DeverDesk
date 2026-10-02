import { UPLOAD_MAX_CHANGES, type UploadEntry, type UploadRequest, type UploadResponse, type UploadTask } from "../../src/sync/recorder-protocol"
import { findProjectByDir } from "../../src/domain/dir-names"
import type { Project, Task, TimeEntry } from "../../src/domain/types"
import { createChangesetService } from "../ai/changesets"
import type { DataSource, PlannedChange, Versioned } from "../mcp/types"
import type { TokenIdentity } from "../types"
import { recorderEntryId, recorderTaskId } from "./ids"

export class UploadLimitError extends Error {
  constructor() {
    super(`一次上传最多产生 ${UPLOAD_MAX_CHANGES} 条改动`)
    this.name = "UploadLimitError"
  }
}

export class UploadConflictError extends Error {
  constructor() {
    super("数据刚被改动，请稍后重试")
    this.name = "UploadConflictError"
  }
}

interface BoundUpload {
  task: UploadTask
  project: Project
  taskId: string
  entryIds: string[]
}

interface StagedChange {
  change: PlannedChange
  keys: Set<string>
}

function noteHasCommit(notes: string, sha: string): boolean {
  const short = sha.slice(0, 7).toLowerCase()
  return notes.split("\n").some((line) => line.match(/^([0-9a-f]{7})\b/i)?.[1].toLowerCase() === short)
}

function appendCommits(notes: string, commits: UploadTask["commits"]): string {
  let result = notes
  for (const commit of commits) {
    if (noteHasCommit(result, commit.sha)) continue
    const line = `${commit.sha.slice(0, 7).toLowerCase()} ${commit.subject}`
    const separator = result.length === 0 ? "" : "\n"
    if (result.length + separator.length + line.length > 2000) break
    result = `${result}${separator}${line}`
  }
  return result
}

function newTask(item: BoundUpload): Task {
  return {
    id: item.taskId,
    seq: 0,
    title: item.task.title,
    projectId: item.project.id,
    status: "done",
    priority: 0,
    estimateMin: 0,
    plannedFor: null,
    startAt: null,
    dueOn: null,
    notes: appendCommits("", item.task.commits),
    subtasks: [],
    createdAt: item.task.finishedAt,
    completedAt: item.task.finishedAt,
    origin: "coding",
  }
}

function updateTask(
  task: Task,
  item: BoundUpload,
  markDone: boolean,
): Task {
  let after = task
  if (markDone && task.status !== "done") {
    after = { ...after, status: "done", completedAt: item.task.finishedAt }
  }
  const notes = appendCommits(after.notes, item.task.commits)
  if (notes !== after.notes) after = { ...after, notes }
  return after
}

function timeEntry(id: string, entry: UploadEntry, taskId: string, projectId: string): TimeEntry {
  return {
    id,
    taskId,
    projectId,
    start: entry.start,
    end: entry.end,
    minutes: entry.minutes,
    origin: "coding",
  }
}

function addSkipped(skipped: Map<string, "unbound" | "duplicate">, key: string, reason: "unbound" | "duplicate"): void {
  if (!skipped.has(key) || reason === "unbound") skipped.set(key, reason)
}

function recordKey(change: PlannedChange): string {
  return `${change.kind}:${change.id}`
}

export async function uploadRecorderTasks(
  db: D1Database,
  data: DataSource,
  token: TokenIdentity,
  request: UploadRequest,
  now: number,
): Promise<UploadResponse> {
  const projects = (await data.projects()).map(({ value }) => value)
  const skipped = new Map<string, "unbound" | "duplicate">()
  const bound: BoundUpload[] = []
  for (const task of request.tasks) {
    const project = findProjectByDir(projects, task.dir)
    if (!project) {
      addSkipped(skipped, task.key, "unbound")
      continue
    }
    bound.push({
      task,
      project,
      taskId: await recorderTaskId(task.key),
      entryIds: await Promise.all(task.entries.map(({ key }) => recorderEntryId(key))),
    })
  }

  const taskIds = [...new Set(bound.map(({ taskId }) => taskId))]
  const entryIds = [...new Set(bound.flatMap(({ entryIds }) => entryIds))]
  const taskSeqs = [...new Set(bound.flatMap(({ task }) => task.taskSeq === undefined ? [] : [task.taskSeq]))]
  const [byId, entries, bySeq] = await Promise.all([
    data.tasks({ ids: taskIds }),
    data.entries({ ids: entryIds }),
    taskSeqs.length === 0 ? Promise.resolve([] as Versioned<Task>[]) : data.tasks({ seqs: taskSeqs }),
  ])
  const tasksById = new Map(byId.map((record) => [record.value.id, record]))
  const entriesById = new Set(entries.map((record) => record.value.id))
  const tasksBySeq = new Map<number, Versioned<Task>[]>()
  for (const record of bySeq) {
    const found = tasksBySeq.get(record.value.seq) ?? []
    found.push(record)
    tasksBySeq.set(record.value.seq, found)
  }

  const staged = new Map<string, StagedChange>()
  const addChange = (change: PlannedChange, taskKey: string): void => {
    const key = recordKey(change)
    const existing = staged.get(key)
    if (existing) {
      existing.change.after = change.after
      existing.keys.add(taskKey)
    } else {
      staged.set(key, { change, keys: new Set([taskKey]) })
    }
  }

  for (const item of bound) {
    const seqMatches = item.task.taskSeq === undefined ? [] : tasksBySeq.get(item.task.taskSeq) ?? []
    const seqTask = seqMatches.length === 1 ? seqMatches[0] : undefined
    const keyedTask = tasksById.get(item.taskId)
    const target = seqTask ?? keyedTask
    let targetTask: Task
    let targetProjectId: string
    let taskChanged = false

    if (!target) {
      targetTask = newTask(item)
      targetProjectId = item.project.id
      addChange({
        kind: "task",
        id: item.taskId,
        action: "create",
        before: null,
        beforeUpdatedAt: null,
        beforeRev: null,
        after: targetTask,
      }, item.task.key)
      taskChanged = true
    } else {
      const taskKey = `task:${target.value.id}`
      const stagedTask = staged.get(taskKey)
      const currentTask = stagedTask?.change.after as Task | undefined ?? target.value
      const markDone = seqTask !== undefined && currentTask.status !== "done"
      targetTask = updateTask(currentTask, item, markDone)
      targetProjectId = target.value.projectId ?? item.project.id
      if (JSON.stringify(targetTask) !== JSON.stringify(currentTask)) {
        addChange({
          kind: "task",
          id: target.value.id,
          action: "update",
          before: target.value,
          beforeUpdatedAt: target.updatedAt,
          beforeRev: target.rev,
          after: targetTask,
        }, item.task.key)
        taskChanged = true
      }
      if (!taskChanged) addSkipped(skipped, item.task.key, "duplicate")
    }

    for (let index = 0; index < item.task.entries.length; index += 1) {
      const id = item.entryIds[index]
      if (entriesById.has(id)) {
        addSkipped(skipped, item.task.key, "duplicate")
        continue
      }
      entriesById.add(id)
      addChange({
        kind: "entry",
        id,
        action: "create",
        before: null,
        beforeUpdatedAt: null,
        beforeRev: null,
        after: timeEntry(id, item.task.entries[index], targetTask.id, targetProjectId),
      }, item.task.key)
    }
  }

  const changes = [...staged.values()].map(({ change }) => change)
  if (changes.length > UPLOAD_MAX_CHANGES) throw new UploadLimitError()
  if (changes.length === 0) {
    return {
      created: { tasks: 0, entries: 0 },
      skipped: [...skipped].map(([key, reason]) => ({ key, reason })),
      changesetId: null,
    }
  }

  const result = await createChangesetService(db, () => now).submit({
    token,
    tool: "recorder",
    reason: "编程自动记录",
    changes,
    forcePreview: false,
    bulk: true,
  })
  const changeBySeq = [...staged.values()]
  if (result.conflicts.some((seq) => changeBySeq[seq]?.change.action === "update")) throw new UploadConflictError()
  let createdTasks = 0
  let createdEntries = 0
  for (const item of result.results) {
    if (item.state === "applied" && item.kind === "task" && changeBySeq[item.seq]?.change.action === "create") createdTasks += 1
    if (item.state === "applied" && item.kind === "entry" && changeBySeq[item.seq]?.change.action === "create") createdEntries += 1
    if (item.state === "conflict") {
      for (const key of changeBySeq[item.seq]?.keys ?? []) addSkipped(skipped, key, "duplicate")
    }
  }
  return {
    created: { tasks: createdTasks, entries: createdEntries },
    skipped: [...skipped].map(([key, reason]) => ({ key, reason })),
    changesetId: result.changesetId,
  }
}
