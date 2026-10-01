/**
 * 本机记录器和服务器之间的约定：记录器、Worker、页面共用这一份。
 * 只放类型和常量，不引用浏览器或 Node 专有的东西，也不用 @/ 路径别名（记录器和 Worker 按相对路径引用）。
 * 规则见 docs/模块设计/编程记录接口与显示.md。
 */

import type { Priority, ProjectStage, TaskStatus } from "../domain/types"

export type RecorderAgent = "claude-code" | "codex"

export const RECORDER_PATHS = {
  bindings: "/api/recorder/bindings",
  briefing: "/api/recorder/briefing",
  upload: "/api/recorder/upload",
  live: "/api/recorder/live",
} as const

/** 一次上传最多多少个任务；服务器还限制一次请求算出的改动不超过 UPLOAD_MAX_CHANGES 条 */
export const UPLOAD_MAX_TASKS = 10
export const UPLOAD_MAX_ENTRIES_PER_TASK = 20
export const UPLOAD_MAX_COMMITS_PER_TASK = 20
/** 任务 + 时间段合起来的改动上限：D1 免费版单次请求约 50 次查询，要给改动明细和状态更新留余量 */
export const UPLOAD_MAX_CHANGES = 40
export const UPLOAD_TITLE_MAX = 80

/** 进行中的窗口多久没更新就算过期（毫秒） */
export const LIVE_EXPIRE_MS = 5 * 60_000
export const LIVE_MAX_WINDOWS = 20

/** GET /api/recorder/bindings */
export interface BindingsResponse {
  /** dir 已转小写；匹配时也转小写比较 */
  bindings: { dir: string; projectId: string; projectName: string }[]
}

export interface BriefingTask {
  code: string
  title: string
  status: TaskStatus
  priority: Priority
  estimateMin: number
  plannedFor: string | null
  dueOn: string | null
}

/** GET /api/recorder/briefing?dir=<目录名> */
export interface BriefingResponse {
  /** 目录名没有绑定副业时只有 bound: false 和 today */
  bound: boolean
  today: string
  project?: { id: string; name: string; stage: ProjectStage }
  plannedToday: BriefingTask[]
  overdue: BriefingTask[]
  open: BriefingTask[]
}

export type UploadSource = "commit" | "done" | "idle" | "end"

export interface UploadEntry {
  /** 稳定键，重复上传不会重复记 */
  key: string
  start: number
  end: number
  /** 实际计入的分钟数，整数 ≥ 1（并行窗口平分后比 end − start 短） */
  minutes: number
}

export interface UploadTask {
  /** 稳定键，≤ 200 字 */
  key: string
  /** 目录名（原大小写） */
  dir: string
  title: string
  source: UploadSource
  /** 到站时刻 */
  finishedAt: number
  commits: { sha: string; subject: string }[]
  /** 提交说明里写了 T-123：把已有任务标成完成，时间记到它名下，不新建 */
  taskSeq?: number
  entries: UploadEntry[]
}

/** POST /api/recorder/upload */
export interface UploadRequest {
  client: { name: string; version: string; agent: RecorderAgent }
  tasks: UploadTask[]
}

export type UploadSkipReason = "unbound" | "duplicate" | "invalid"

export interface UploadResponse {
  created: { tasks: number; entries: number }
  skipped: { key: string; reason: UploadSkipReason }[]
  /** 没有任何要写的改动时为 null */
  changesetId: string | null
}

export interface LiveWindow {
  session: string
  dir: string
  agent: RecorderAgent
  /** 攒着的、还没到站的第一个计入段的开始 */
  since: number
  /** 攒到现在已经计入的分钟（平分后） */
  minutes: number
}

/** PUT /api/recorder/live 的请求体：整个替换 */
export interface LiveRequest {
  windows: LiveWindow[]
}

/** GET /api/recorder/live */
export interface LiveResponse {
  windows: (LiveWindow & { projectId: string; projectName: string })[]
  /** 记录器最后一次更新的时间；超过 LIVE_EXPIRE_MS 时 windows 为空 */
  updatedAt: number
}

/** 由 key 算任务和时间段的记录编号用的前缀 */
export const RECORDER_TASK_ID_PREFIX = "t-r"
export const RECORDER_ENTRY_ID_PREFIX = "E-r"
