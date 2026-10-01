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

/**
 * 访问令牌的权限档：
 * - read：只看，MCP 只给读工具；
 * - propose：只能提议，AI 的改动存成提议，用户在页面里采纳才生效；
 * - write：直接改，改动立即生效（删除或一次改很多条先给 AI 预览）。
 */
export type TokenTier = "read" | "propose" | "write"

export const TOKEN_TIERS: readonly TokenTier[] = ["read", "propose", "write"]

/** 新建令牌时不选权限就用这一档 */
export const DEFAULT_TOKEN_TIER: TokenTier = "propose"

/** 个人令牌的公开信息（令牌本身只在新建那一刻返回一次） */
export interface TokenInfo {
  id: string
  name: string
  tier: TokenTier
  createdAt: number
  lastUsedAt: number | null
}

/** POST /api/tokens 的请求体 */
export interface CreateTokenRequest {
  name: string
  tier?: TokenTier
}

/** PATCH /api/tokens/<编号> 的请求体 */
export interface UpdateTokenRequest {
  tier: TokenTier
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

/**
 * AI 改动包的状态（规则见 docs/模块设计/AI改动记录.md）：
 * preview 等 AI 确认；proposed 等用户采纳；applied 已生效；rejected 用户不要；
 * withdrawn AI 撤回；undone 已撤销；expired 预览超时没确认。
 */
export type ChangesetStatus = "preview" | "proposed" | "applied" | "rejected" | "withdrawn" | "undone" | "expired"

export type ChangeAction = "create" | "update" | "delete"

/** 一条改动的状态：pending 还没生效；conflict 生效或撤销时发现记录已被人改过，跳过了 */
export type ChangeState = "pending" | "applied" | "conflict" | "undone"

/** 改动包里的一条改动 */
export interface AiChange {
  /** 在改动包里的顺序，从 0 起 */
  seq: number
  kind: RecordKind
  recordId: string
  action: ChangeAction
  /** 改之前的内容；新建为 null */
  before: unknown | null
  /** 改之后的内容；删除为 null */
  after: unknown | null
  state: ChangeState
}

/** AI 一次操作打成的改动包 */
export interface AiChangeset {
  id: string
  /** 产生它的令牌；令牌被撤销后仍保留编号 */
  tokenId: string | null
  /** 当时令牌的名称，例如「Claude Code」 */
  clientName: string
  /** 工具名，例如 add_tasks；老的操作接口写入的为 rest:tasks、rest:ledger */
  tool: string
  /** AI 给的一句理由 */
  reason: string | null
  status: ChangesetStatus
  createdAt: number
  /** 采纳、拒绝、确认、撤销、撤回、过期的时间 */
  decidedAt: number | null
  changes: AiChange[]
}

/** GET /api/ai/changesets?status=pending|all&cursor=<上一页给的游标>&limit=<1–50>，按创建时间倒序 */
export interface ChangesetListResponse {
  changesets: AiChangeset[]
  /** 等待采纳的提议数（窗口栏角标用） */
  pendingCount: number
  /** 下一页的游标（不透明字符串，原样带回）；没有更多为 null */
  nextCursor: string | null
}

/** POST /api/ai/changesets/<编号>/undo 的请求体；不给 seqs 就撤整包 */
export interface UndoChangesetRequest {
  seqs?: number[]
}

/** POST /api/ai/changesets/<编号>/accept|reject|undo 的返回 */
export interface ChangesetActionResponse {
  changeset: AiChangeset
  /** 因为之后被人改过而没有生效或没有撤销的改动序号 */
  conflicts: number[]
}

/** 接口地址（和页面同一个域名） */
export const API_PATHS = {
  session: "/api/session",
  sync: "/api/sync",
  tokens: "/api/tokens",
  tasks: "/api/tasks",
  ledger: "/api/ledger",
  summary: "/api/summary",
  aiChangesets: "/api/ai/changesets",
} as const

/** MCP 服务地址（不在 /api 下，Worker 入口单独分流） */
export const MCP_PATH = "/mcp"
