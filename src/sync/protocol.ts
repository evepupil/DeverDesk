/**
 * 在线版的同步约定：浏览器和 Worker 共用这一份，两边按它收发数据。
 * 这里只放类型和常量，不引用浏览器或 Worker 专有的东西，也不用 @/ 路径别名（Worker 按相对路径引用）。
 *
 * 数据按「记录」存：一个副业、一件任务、一段投入、一笔收支、一个例行、一周回顾各是一条；
 * 作息设置和计时器各只有一条（编号固定为 SINGLETON_ID）。
 * 谁新谁赢：每条记录带最后修改时间，云端只接受比自己手里那份更新（或一样新）的改动。
 */

export type RecordKind = "project" | "task" | "entry" | "ledger" | "routine" | "note" | "profile" | "timer"

export const RECORD_KINDS: readonly RecordKind[] = ["project", "task", "entry", "ledger", "routine", "note", "profile", "timer"]

/** 多条记录的种类，对应工作台数据里的哪个列表 */
export const LIST_KINDS = {
  project: "projects",
  task: "tasks",
  entry: "entries",
  ledger: "ledger",
  routine: "routines",
  note: "notes",
} as const

export type ListKind = keyof typeof LIST_KINDS

/** 只有一条的记录（作息设置、计时器）用的固定编号 */
export const SINGLETON_ID = "singleton"

/** 记录是从哪来的：界面上改的、接口写的（以后的 AI 助手、自动记账）、导入的备份 */
export type RecordSource = "app" | "api" | "import"

/** 云端的一条记录 */
export interface SyncRecord {
  kind: RecordKind
  id: string
  /** 记录内容；删除后为 null（删除也要同步给别的设备） */
  data: unknown | null
  /** 最后修改时间（毫秒），据此判断谁新 */
  updatedAt: number
  /** 云端写入顺序号，只增不减；拉取时从上次拿到的位置往后拿 */
  rev: number
}

/** 浏览器上传的一次改动 */
export interface SyncChange {
  kind: RecordKind
  id: string
  /** 改后的内容；null 表示删除 */
  data: unknown | null
  updatedAt: number
}

/** GET /api/sync?since=<rev>&limit=<n> */
export interface PullResponse {
  /** 按写入顺序排好的记录 */
  records: SyncRecord[]
  /** 这一页最后一条的顺序号；下次从这里往后拿 */
  cursor: number
  /** 后面还有没拿完的 */
  more: boolean
}

/** POST /api/sync */
export interface PushRequest {
  changes: SyncChange[]
}

export interface PushResponse {
  /** 被云端更新的版本压下的改动：这些记录云端那份更新，浏览器应改用云端这份 */
  rejected: SyncRecord[]
}

/** 登录方式：部署时设的口令、Cloudflare Access、个人令牌（给以后的 AI 助手） */
export type AuthMethod = "password" | "access" | "token"

/** GET /api/session */
export interface SessionResponse {
  authenticated: boolean
  via: AuthMethod | null
  /** 部署时设了口令：登录页才显示口令输入框 */
  passwordEnabled: boolean
}

/** POST /api/session 的请求体 */
export interface LoginRequest {
  password: string
}

/** 个人令牌的公开信息（令牌本身只在新建那一刻返回一次） */
export interface TokenInfo {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number | null
}

/** POST /api/tokens 的返回 */
export interface CreatedToken extends TokenInfo {
  /** 令牌本身，只返回这一次 */
  token: string
}

/** 出错时的返回体 */
export interface ApiError {
  error: string
  /** 登录尝试太多次时，多少秒后可以再试 */
  retryAfter?: number
}

/** 拉取时一页最多多少条 */
export const PULL_PAGE_SIZE = 500

/** 上传时一批最多多少条改动：D1 免费版每次请求大约只能做 50 次查询 */
export const PUSH_BATCH_SIZE = 40

/** 接口地址（和页面同一个域名） */
export const API_PATHS = {
  session: "/api/session",
  sync: "/api/sync",
  tokens: "/api/tokens",
  tasks: "/api/tasks",
  ledger: "/api/ledger",
  summary: "/api/summary",
} as const
