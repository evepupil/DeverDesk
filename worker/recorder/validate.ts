import {
  LIVE_MAX_WINDOWS,
  UPLOAD_MAX_COMMITS_PER_TASK,
  UPLOAD_MAX_ENTRIES_PER_TASK,
  UPLOAD_MAX_TASKS,
  UPLOAD_TITLE_MAX,
  type LiveRequest,
  type RecorderAgent,
  type UploadEntry,
  type UploadRequest,
  type UploadSource,
  type UploadTask,
} from "../../src/sync/recorder-protocol"

const UPLOAD_MIN_TIMESTAMP = Date.UTC(2000, 0, 1)
const UPLOAD_FUTURE_MS = 24 * 60 * 60_000
const MAX_ENTRY_DURATION_MS = 48 * 60 * 60_000
const LIVE_PAST_MS = 48 * 60 * 60_000
const LIVE_FUTURE_MS = 60 * 60_000
const LIVE_MAX_MINUTES = 2_880

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function agent(value: unknown): value is RecorderAgent {
  return value === "claude-code" || value === "codex"
}

function boundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max
}

function invalid<T>(error: string): Validation<T> {
  return { ok: false, error }
}

export function validateUploadRequest(value: unknown, now = Date.now()): Validation<UploadRequest> {
  if (!isObject(value)) return invalid("请求体必须是对象")
  const client = value.client
  if (!isObject(client)) return invalid("client 必须包含 name、version 和 agent")
  if (!boundedText(client.name, 1, 120)) return invalid("client.name 必须是 1–120 字符的非空文本")
  if (!boundedText(client.version, 1, 60)) return invalid("client.version 必须是 1–60 字符的非空文本")
  if (!agent(client.agent)) return invalid("client.agent 必须是 claude-code 或 codex")
  if (!Array.isArray(value.tasks) || value.tasks.length > UPLOAD_MAX_TASKS) {
    return invalid(`tasks 必须是最多 ${UPLOAD_MAX_TASKS} 个任务的数组`)
  }

  const keys = new Set<string>()
  const entryKeys = new Set<string>()
  const tasks: UploadTask[] = []
  for (let index = 0; index < value.tasks.length; index += 1) {
    const prefix = `tasks[${index}]`
    const input = value.tasks[index]
    if (!isObject(input)) return invalid(`${prefix} 必须是对象`)
    if (!boundedText(input.key, 1, 200)) return invalid(`${prefix}.key 必须是 1–200 字符的非空文本`)
    if (keys.has(input.key)) return invalid(`${prefix}.key 在本次请求中重复`)
    keys.add(input.key)
    if (!boundedText(input.dir, 1, 60)) return invalid(`${prefix}.dir 必须是 1–60 字符的非空文本`)
    if (!boundedText(input.title, 1, UPLOAD_TITLE_MAX)) return invalid(`${prefix}.title 必须是 1–${UPLOAD_TITLE_MAX} 字符的非空文本`)
    if (input.source !== "commit" && input.source !== "done" && input.source !== "idle" && input.source !== "end") {
      return invalid(`${prefix}.source 不受支持`)
    }
    if (!finite(input.finishedAt)) return invalid(`${prefix}.finishedAt 必须是有限数字`)
    const finishedAt = Math.max(UPLOAD_MIN_TIMESTAMP, Math.min(now + UPLOAD_FUTURE_MS, input.finishedAt))
    if (!Array.isArray(input.commits) || input.commits.length > UPLOAD_MAX_COMMITS_PER_TASK) {
      return invalid(`${prefix}.commits 必须是最多 ${UPLOAD_MAX_COMMITS_PER_TASK} 条提交的数组`)
    }
    const commits: UploadTask["commits"] = []
    for (let commitIndex = 0; commitIndex < input.commits.length; commitIndex += 1) {
      const commit = input.commits[commitIndex]
      if (!isObject(commit) || typeof commit.sha !== "string" || !/^[0-9a-fA-F]{7,64}$/.test(commit.sha)) {
        return invalid(`${prefix}.commits[${commitIndex}].sha 必须是 7–64 位十六进制提交号`)
      }
      if (typeof commit.subject !== "string" || commit.subject.length > 200) {
        return invalid(`${prefix}.commits[${commitIndex}].subject 最多 200 字符`)
      }
      commits.push({ sha: commit.sha, subject: commit.subject })
    }
    if (input.taskSeq !== undefined && (!Number.isInteger(input.taskSeq) || (input.taskSeq as number) < 1 || (input.taskSeq as number) > 999999)) {
      return invalid(`${prefix}.taskSeq 必须是 1–999999 的整数`)
    }
    if (!Array.isArray(input.entries) || input.entries.length > UPLOAD_MAX_ENTRIES_PER_TASK) {
      return invalid(`${prefix}.entries 必须是最多 ${UPLOAD_MAX_ENTRIES_PER_TASK} 条时间段的数组`)
    }
    const entries: UploadEntry[] = []
    for (let entryIndex = 0; entryIndex < input.entries.length; entryIndex += 1) {
      const entry = input.entries[entryIndex]
      const entryPrefix = `${prefix}.entries[${entryIndex}]`
      if (!isObject(entry)) return invalid(`${entryPrefix} 必须是对象`)
      if (!boundedText(entry.key, 1, 200)) return invalid(`${entryPrefix}.key 必须是 1–200 字符的非空文本`)
      if (entryKeys.has(entry.key)) return invalid(`${entryPrefix}.key 在本次请求中重复`)
      entryKeys.add(entry.key)
      if (!finite(entry.start)) return invalid(`${entryPrefix}.start 必须是有限数字`)
      if (!finite(entry.end)) return invalid(`${entryPrefix}.end 必须是有限数字`)
      if (entry.start < UPLOAD_MIN_TIMESTAMP || entry.start > now + UPLOAD_FUTURE_MS) {
        return invalid(`${entryPrefix}.start 必须位于 2000-01-01 至未来 24 小时内`)
      }
      if (entry.end < UPLOAD_MIN_TIMESTAMP || entry.end > now + UPLOAD_FUTURE_MS) {
        return invalid(`${entryPrefix}.end 必须位于 2000-01-01 至未来 24 小时内`)
      }
      if (entry.start >= entry.end) return invalid(`${entryPrefix}.start 必须早于 end`)
      const duration = entry.end - entry.start
      if (duration > MAX_ENTRY_DURATION_MS) return invalid(`${entryPrefix}.end 与 start 间隔不能超过 48 小时`)
      const maxMinutes = Math.ceil(duration / 60_000) + 1
      if (!Number.isSafeInteger(entry.minutes) || (entry.minutes as number) < 1 || (entry.minutes as number) > maxMinutes) {
        return invalid(`${entryPrefix}.minutes 必须是 1–${maxMinutes} 的整数`)
      }
      entries.push({ key: entry.key, start: entry.start, end: entry.end, minutes: entry.minutes as number })
    }
    tasks.push({
      key: input.key,
      dir: input.dir,
      title: input.title.trim(),
      source: input.source as UploadSource,
      finishedAt,
      commits,
      ...(input.taskSeq === undefined ? {} : { taskSeq: input.taskSeq as number }),
      entries,
    })
  }

  return { ok: true, value: { client: { name: client.name, version: client.version, agent: client.agent }, tasks } }
}

export function validateLiveRequest(value: unknown, now = Date.now()): Validation<LiveRequest> {
  if (!isObject(value) || !Array.isArray(value.windows) || value.windows.length > LIVE_MAX_WINDOWS) {
    return invalid(`windows 必须是最多 ${LIVE_MAX_WINDOWS} 个窗口的数组`)
  }
  const sessions = new Set<string>()
  const windows: LiveRequest["windows"] = []
  for (let index = 0; index < value.windows.length; index += 1) {
    const item = value.windows[index]
    const prefix = `windows[${index}]`
    if (!isObject(item)) return invalid(`${prefix} 必须是对象`)
    if (!boundedText(item.session, 1, 200)) return invalid(`${prefix}.session 必须是 1–200 字符的非空文本`)
    if (sessions.has(item.session)) return invalid(`${prefix}.session 不能重复`)
    sessions.add(item.session)
    if (!boundedText(item.dir, 1, 60)) return invalid(`${prefix}.dir 必须是 1–60 字符的非空文本`)
    if (!agent(item.agent)) return invalid(`${prefix}.agent 必须是 claude-code 或 codex`)
    if (!finite(item.since)) return invalid(`${prefix}.since 必须是有限数字`)
    if (!finite(item.minutes)) return invalid(`${prefix}.minutes 必须是有限数字`)
    windows.push({
      session: item.session,
      dir: item.dir,
      agent: item.agent,
      since: Math.max(now - LIVE_PAST_MS, Math.min(now + LIVE_FUTURE_MS, item.since)),
      minutes: Math.max(0, Math.min(LIVE_MAX_MINUTES, item.minutes)),
    })
  }
  return { ok: true, value: { windows } }
}
