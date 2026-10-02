// 本机记录器的核心类型：事件日志里的事件、引擎的输入输出。规格见 docs/模块设计/本机记录器.md。
// core/ 下的文件只依赖这里，不读文件、不联网、不调 git。
import type { RecorderAgent } from "../../../../src/sync/recorder-protocol"

export type Agent = RecorderAgent

/** 事件日志每一行的公共部分 */
export interface EventBase {
  v: 1
  /** 毫秒时间戳；提交事件取提交自己的时间 */
  t: number
  agent: Agent
  /** 会话编号（窗口） */
  session: string
  /** 目录名（保留原大小写；匹配副业时不分大小写） */
  dir: string
  cwd: string
  /** 回填出来的 */
  backfill?: true
}

export type StartEvent = EventBase & { kind: "start"; source?: string; repo?: string }
/** text：你这句话的第一句，≤ 120 字 */
export type PromptEvent = EventBase & { kind: "prompt"; text?: string }
/** summary：AI 最后一条回复的第一句，≤ 200 字 */
export type StopEvent = EventBase & { kind: "stop"; summary?: string }
export type EndEvent = EventBase & { kind: "end"; reason?: string }
export type CommitEvent = EventBase & {
  kind: "commit"
  /**
   * 钩子发现这个提交的时刻（毫秒）。引擎按「max(提交时间, 发现时刻)」给提交排队处理，
   * 这样晚发现的老提交（合并、rebase 带进来的）只会排在已输出的任务之后，不会重新切分它们。回填出来的提交没有这一项。
   */
  seenAt?: number
  repo: string
  sha: string
  subject: string
  /** 只留前 500 字，只用来找 T-123 这类任务引用，不上传 */
  body?: string
  additions: number
  deletions: number
  files: number
  authoredAt: number
}
export type DoneEvent = EventBase & { kind: "done"; title: string }

export type RecorderEvent = StartEvent | PromptEvent | StopEvent | EndEvent | CommitEvent | DoneEvent
export type EventKind = RecorderEvent["kind"]

/** 到站的来源 */
export type ArrivalSource = "commit" | "done" | "idle" | "end"

export interface ComputedEntry {
  /** 稳定键：<任务键>#<时间段开始毫秒> */
  key: string
  start: number
  end: number
  /** 整数分钟 ≥ 1，已按并行平分 */
  minutes: number
}

export interface ComputedTask {
  /** 稳定键，重算不变：见 docs/模块设计/本机记录器.md「键的写法」 */
  key: string
  agent: Agent
  session: string
  dir: string
  source: ArrivalSource
  title: string
  finishedAt: number
  commits: { sha: string; subject: string }[]
  /** 提交说明里写了任务编号 T-123 */
  taskSeq?: number
  entries: ComputedEntry[]
}

/** 进行中的窗口（给页面显示用） */
export interface OpenWindow {
  session: string
  dir: string
  agent: Agent
  /** 攒着的、还没到站的第一个计入段的开始 */
  since: number
  /** 攒到现在已经计入的分钟（含还没确认的尾巴；平分后） */
  minutes: number
}

export interface EngineResult {
  /** 已到站的任务，按到站时间排序（同刻按键排序） */
  tasks: ComputedTask[]
  open: OpenWindow[]
}

/** git 命令的运行器：真实实现用 child_process，单测用假的 */
export interface GitRunner {
  run(args: string[], cwd: string, options?: { timeoutMs?: number }): Promise<{ ok: boolean; stdout: string; stderr: string }>
}

/** 一个提交的信息（detectCommits 和回填用） */
export interface CommitInfo {
  sha: string
  /** 提交时间（毫秒） */
  committedAt: number
  /** 作者时间（毫秒） */
  authoredAt: number
  authorEmail: string
  subject: string
  body: string
  additions: number
  deletions: number
  files: number
}

/** 回填时按时间范围找提交（真实实现在 git/commits.ts） */
export type CommitFinder = (repoRoot: string, sinceMs: number, untilMs: number) => Promise<CommitInfo[]>

/** 回填时认目录名（真实实现在 git/resolve-project.ts；路径已经不存在时自己退回到按路径猜） */
export type DirNameResolver = (cwd: string) => Promise<{ dir: string; repo?: string }>
