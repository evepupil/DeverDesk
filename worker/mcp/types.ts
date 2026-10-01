// MCP 服务内部的约定：数据源、时钟、工具定义、写入计划、改动记录服务。
// 规格见 docs/模块设计/MCP服务.md 与 docs/模块设计/AI改动记录.md；各部分实现都按这里的形状写，改形状要同时改两份文档。
import type {
  ActiveTimer,
  DayKey,
  EntryKind,
  EntryStatus,
  LedgerEntry,
  Profile,
  Project,
  Routine,
  Task,
  TaskStatus,
  TimeEntry,
  WeekNote,
} from "../../src/domain/types"
import type {
  AiChangeset,
  ChangeAction,
  ChangesetListResponse,
  ChangeState,
  RecordKind,
} from "../../src/sync/protocol"
import type { TokenIdentity } from "../types"

export type { TokenIdentity }

// ───────────────────────── 数据源 ─────────────────────────

/** 一条没删除的记录、它的修改时间和写入顺序号；写入时拿写入顺序号做冲突检查 */
export interface Versioned<T> {
  value: T
  updatedAt: number
  /** 库里的写入顺序号（每次写入都不同） */
  rev: number
}

/** 某条记录在库里的现状（含已删除的） */
export interface RecordVersion {
  /** 当前内容；已删除为 null */
  value: unknown | null
  updatedAt: number
  rev: number
  deleted: boolean
}

/** 单例记录（作息设置、计时器）的现状：value 为 null 表示没有；updatedAt、rev 为 null 表示库里从没有过这条 */
export interface SingletonVersion<T> {
  value: T | null
  updatedAt: number | null
  rev: number | null
}

/** 任务查询：条件之间是「并且」；数组条件是「其中之一」 */
export interface TaskQuery {
  ids?: string[]
  /** 显示编号（T-123 里的 123） */
  seqs?: number[]
  statuses?: TaskStatus[]
  /** 计划日范围（含两端） */
  plannedFrom?: DayKey
  plannedTo?: DayKey
  /** 只要没排日子的 */
  unplanned?: boolean
  /** 截止日不早于这天（没有截止日的不算） */
  dueFrom?: DayKey
  /** 截止日不晚于这天（没有截止日的不算） */
  dueTo?: DayKey
  /** 完成时间范围（真实毫秒，含开始、不含结束） */
  completedFrom?: number
  completedTo?: number
  /** 副业；null 表示不属于任何副业 */
  projectId?: string | null
  /** 标题包含（不分大小写） */
  text?: string
  /** 任务列表的排序；省略时按显示编号 */
  orderBy?: "priority" | "due"
  /** 条数上限 */
  limit?: number
}

/** 投入记录查询：按开始时间（真实毫秒，含开始、不含结束） */
export interface EntryQuery {
  ids?: string[]
  from?: number
  to?: number
  projectId?: string | null
  taskIds?: string[]
  limit?: number
}

/** 收支查询：按发生日期（含两端） */
export interface LedgerQuery {
  ids?: string[]
  from?: DayKey
  to?: DayKey
  statuses?: EntryStatus[]
  kinds?: EntryKind[]
  projectId?: string | null
  externalIds?: string[]
  /** 备注包含（不分大小写） */
  text?: string
  limit?: number
}

/**
 * 工具读数据的唯一入口。D1 实现（worker/mcp/data/d1.ts）按条件拼 SQL，只解析查回来的行；
 * 内存实现（worker/mcp/data/memory.ts）给单元测试用。两者对同样的条件必须返回同样的结果。
 * 列表默认顺序：任务按显示编号、投入按开始时间、收支按日期再按创建时间、其余按库里的写入顺序；任务可通过 orderBy 选择优先级或截止日排序。
 */
export interface DataSource {
  profile(): Promise<SingletonVersion<Profile>>
  timer(): Promise<SingletonVersion<ActiveTimer>>
  projects(): Promise<Versioned<Project>[]>
  routines(): Promise<Versioned<Routine>[]>
  /** 不给 weeks 就返回全部 */
  notes(weeks?: DayKey[]): Promise<Versioned<WeekNote>[]>
  tasks(query: TaskQuery): Promise<Versioned<Task>[]>
  countTasksByProject?(query: TaskQuery): Promise<Map<string | null, number>>
  entries(query: EntryQuery): Promise<Versioned<TimeEntry>[]>
  sumEntryMinutesByTask?(taskIds: string[]): Promise<Map<string, number>>
  ledger(query: LedgerQuery): Promise<Versioned<LedgerEntry>[]>
  /** 某条记录的现状（含已删除的）；从没有过返回 null */
  record(kind: RecordKind, id: string): Promise<RecordVersion | null>
}

// ───────────────────────── 时钟 ─────────────────────────

/**
 * 按用户时区换算的时钟（实现在 worker/mcp/clock.ts 的 createClock）。
 * 「墙上时间」：把真实时间平移成「用 UTC 读出来正好是用户本地时间」的毫秒数，
 * 用来喂给 src/domain 里按运行环境本地时间（Worker 里是 UTC）取日期的计算函数。
 */
export interface Clock {
  /** IANA 时区名；作息设置里没有时为 "UTC" */
  readonly timeZone: string
  /** 作息设置里有时区为 true */
  readonly timeZoneKnown: boolean
  /** 真实的现在（毫秒） */
  readonly now: number
  /** 用户本地的今天 */
  readonly today: DayKey
  /** 真实毫秒属于用户本地哪一天 */
  dayOf(ms: number): DayKey
  /** 用户本地某天 00:00 对应的真实毫秒 */
  startOfDay(day: DayKey): number
  /** 真实毫秒 → 墙上时间毫秒 */
  toWall(ms: number): number
  /** 墙上时间毫秒 → 真实毫秒（夏令时跳过的那一小时按跳过后的时间算） */
  fromWall(wallMs: number): number
  /** 「YYYY-MM-DDTHH:mm」或「HH:mm」（配 defaultDay，不给就是今天）→ 真实毫秒；格式不对返回 null */
  parseLocal(text: string, defaultDay?: DayKey): number | null
  /** 真实毫秒 → 「YYYY-MM-DD HH:mm」本地时间 */
  formatLocal(ms: number): string
  /** 真实毫秒 → 「HH:mm」本地时间 */
  formatLocalTime(ms: number): string
  /** 真实毫秒是本地当天第几分钟 */
  minuteOfDay(ms: number): number
}

// ───────────────────────── 工具 ─────────────────────────

/** 工具输入的 JSON Schema（根节点必须是 object） */
export interface JsonSchema {
  type: "object"
  properties?: Record<string, unknown>
  required?: readonly string[]
  additionalProperties?: boolean
  [keyword: string]: unknown
}

/** 每次调工具时拿到的上下文 */
export interface ToolContext {
  data: DataSource
  clock: Clock
  token: TokenIdentity
  /** 生成新记录编号：前缀加随机字符，例如 newId("t") → "t-…" */
  newId(prefix: string): string
}

interface ToolBase {
  /** 工具名：小写字母和下划线 */
  name: string
  /** 给人看的标题（英文） */
  title: string
  /** 给 AI 看的说明（英文）：第一句做什么，第二句什么时候用 */
  description: string
  inputSchema: JsonSchema
}

/** 读工具：只读，返回结构化结果 */
export interface ReadTool<I = Record<string, unknown>> extends ToolBase {
  kind: "read"
  run(ctx: ToolContext, input: I): Promise<Record<string, unknown>>
}

/** 一条要写的改动（工具算出来，交给改动记录服务落库） */
export interface PlannedChange {
  kind: RecordKind
  /** 记录编号；周笔记是那周的周一；作息设置和计时器是 SINGLETON_ID */
  id: string
  /** create：库里没有或已删除；update：改现有的；delete：删现有的 */
  action: ChangeAction
  /** 改之前的内容；新建为 null */
  before: unknown | null
  /** 改之前那一版的修改时间：库里从没有过为 null；已删除的记录给它删除时的修改时间。只用来算新的修改时间 */
  beforeUpdatedAt: number | null
  /** 改之前那一版的写入顺序号，冲突检查用：库里从没有过为 null；已删除的记录给它删除时的写入顺序号 */
  beforeRev: number | null
  /** 改之后的内容；删除为 null */
  after: unknown | null
}

/** 写工具算出来的结果 */
export interface WritePlan {
  changes: PlannedChange[]
  /** 结构化输出（不含 changeset 字段，由框架补上） */
  output: Record<string, unknown>
  /** 给 AI 的提醒，例如跳过了哪些疑似重复的收支 */
  warnings?: string[]
  /** 输入里的 reason：给用户看的一句为什么 */
  reason?: string | null
}

/** 写工具：算出改动清单，由框架按令牌权限交给改动记录服务 */
export interface WriteTool<I = Record<string, unknown>> extends ToolBase {
  kind: "write"
  /** 会改掉或删掉已有内容（给客户端的 destructiveHint） */
  destructive: boolean
  /** 直接改档也一律先给预览（删除类） */
  alwaysPreview?: boolean
  plan(ctx: ToolContext, input: I): Promise<WritePlan>
  /**
   * 落库后整理最终输出（可选）。例如新建任务的显示编号要写入后才确定，从 result.results 里取。
   * 不提供时输出就是 plan.output。框架会再补上 changeset 字段。
   */
  present?(ctx: ToolContext, plan: WritePlan, result: SubmitResult): Record<string, unknown>
}

/** 改动管理工具（manage_changes）：直接调改动记录服务 */
export interface ChangesTool<I = Record<string, unknown>> extends ToolBase {
  kind: "changes"
  run(ctx: ToolContext, changesets: ChangesetService, input: I): Promise<Record<string, unknown>>
}

/** 各组工具放进同一个清单时用的类型（输入在执行前已按 JSON Schema 校验过，各工具自己声明输入形状） */
export type ToolDefinition = ReadTool<unknown> | WriteTool<unknown> | ChangesTool<unknown>

/** 工具输入不合规矩（跨字段规则、找不到记录、引用有歧义……）：框架转成 isError 结果，文字原样给 AI */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ToolInputError"
  }
}

// ───────────────────────── 改动记录服务 ─────────────────────────

/** 一次写入的结果 */
export interface SubmitResult {
  /** 没有改动（no_change）时为 null */
  changesetId: string | null
  status: "applied" | "proposed" | "preview" | "no_change"
  /** 按提交顺序的每条结果；after 是真正写进库的内容（新建任务带上分配好的显示编号）；没生效时为 null */
  results: SubmitItemResult[]
  /** 冲突没生效的序号 */
  conflicts: number[]
}

export interface SubmitItemResult {
  seq: number
  kind: RecordKind
  id: string
  state: ChangeState
  after: unknown | null
}

export interface SubmitInput {
  token: TokenIdentity
  tool: string
  reason: string | null
  changes: PlannedChange[]
  /** 直接改档也先给预览 */
  forcePreview: boolean
  /**
   * 批量模式（只给本机记录器上传用）：要求直接改档；不触发预览阈值、不计入限速；
   * 单次上限改为 MAX_BULK_CHANGES。其余（冲突检查、原子状态转换、留底、撤销）不变。
   */
  bulk?: boolean
}

/** 采纳、拒绝、确认、撤销、撤回的结果 */
export interface ChangesetActionResult {
  changeset: AiChangeset
  conflicts: number[]
}

export type ChangesetErrorCode =
  | "not_found"
  | "wrong_status"
  | "expired"
  | "forbidden"
  | "rate_limited"
  | "too_many"

/** 改动记录服务的业务错误；MCP 框架转成 isError，页面接口转成 4xx */
export class ChangesetError extends Error {
  readonly code: ChangesetErrorCode
  /** 限速时还要等几秒 */
  readonly retryAfter?: number

  constructor(code: ChangesetErrorCode, message: string, retryAfter?: number) {
    super(message)
    this.name = "ChangesetError"
    this.code = code
    this.retryAfter = retryAfter
  }
}

/** 一次写工具最多改几条 */
export const MAX_CHANGES_PER_CALL = 25

/** 直接改档超过这么多条先给预览 */
export const PREVIEW_THRESHOLD = 10

/** 批量模式单次上限：D1 免费版单次请求约 50 次查询，要给改动明细和状态更新留余量 */
export const MAX_BULK_CHANGES = 40

/**
 * 改动记录服务（实现在 worker/ai/changesets.ts 的 createChangesetService(db, now?)）。
 * AI 侧的操作只能动同一个令牌产生的改动包；页面侧的 accept、reject、undoByUser 只给口令或 Access 登录调用。
 */
export interface ChangesetService {
  submit(input: SubmitInput): Promise<SubmitResult>
  /** AI 确认预览（直接改档）；不给编号就取这个令牌最近一个预览 */
  confirm(token: TokenIdentity, changesetId?: string): Promise<ChangesetActionResult>
  /** AI 撤销自己的改动（直接改档）；不给编号就取这个令牌最近一个已生效的 */
  undo(token: TokenIdentity, changesetId?: string, seqs?: number[]): Promise<ChangesetActionResult>
  /** AI 撤回自己的提议（提议档）；不给编号就取这个令牌最近一个提议 */
  withdraw(token: TokenIdentity, changesetId?: string): Promise<ChangesetActionResult>
  /** 页面：采纳提议 */
  accept(changesetId: string): Promise<ChangesetActionResult>
  /** 页面：不要这个提议 */
  reject(changesetId: string): Promise<ChangesetActionResult>
  /** 页面：撤销整包或其中几条 */
  undoByUser(changesetId: string, seqs?: number[]): Promise<ChangesetActionResult>
  /** 页面：列出改动包（cursor 是上一页返回的 nextCursor） */
  list(query: { status: "pending" | "all"; cursor?: string; limit: number }): Promise<ChangesetListResponse>
}
