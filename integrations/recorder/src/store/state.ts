// 加锁、原子写的 state.json，以及只追加的 uploaded.jsonl。规格见 docs/模块设计/本机记录器.md「本机文件」。
// 占位：由「记录器外壳」那一路实现。
import type { Agent } from "../core/types"
import type { RepoState } from "../git/commits"

export interface RecorderState {
  v: 1
  /** 仓库根 → 提交状态 */
  repos: Record<string, RepoState>
  /** cwd → 目录名缓存（有效期 1 天） */
  dirCache: Record<string, { dir: string; repo?: string; at: number }>
  /** 各 agent 第一个实时事件的时间（回填只填它之前的） */
  firstLiveEvent: Partial<Record<Agent, number>>
  /** 最近一次钩子事件（doctor 用） */
  lastHook?: { at: number; agent: Agent; event: string; session: string }
  lastSync?: { startedAt: number; finishedAt: number; ok: boolean; message?: string; uploadedTasks?: number }
  /** 最近一次 PUT 进行中的内容和时间（用来省重复请求） */
  lastLive?: { at: number; fingerprint: string }
}

export function emptyState(): RecorderState {
  return { v: 1, repos: {}, dirCache: {}, firstLiveEvent: {} }
}

/** 读-改-写，持有 state.lock；写临时文件再改名。fn 返回新状态。出错抛异常（调用方负责吞掉并记日志） */
export async function updateState(home: string, fn: (state: RecorderState) => RecorderState | void): Promise<RecorderState> {
  void home
  void fn
  throw new Error("updateState 还没实现")
}

/** 只读（不加锁）；文件不存在或坏了返回空状态 */
export function readState(home: string): RecorderState {
  void home
  throw new Error("readState 还没实现")
}

/** uploaded.jsonl：每行 { k: 键, at: 毫秒, rejected?: 原因 }；只有持有 sync.lock 的同步进程追加 */
export function readUploadedKeys(home: string): { done: Set<string>; rejected: Map<string, string> } {
  void home
  throw new Error("readUploadedKeys 还没实现")
}

export function appendUploaded(home: string, lines: { k: string; at: number; rejected?: string }[]): void {
  void home
  void lines
  throw new Error("appendUploaded 还没实现")
}
