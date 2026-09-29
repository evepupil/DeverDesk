import {
  API_PATHS,
  type ApiError,
  type CreatedToken,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SessionResponse,
  type SyncChange,
  type TokenInfo,
} from "@/sync/protocol"
import { getT } from "@/i18n/runtime"

/**
 * 在线版的接口调用：和页面同一个域名，带上登录 Cookie。
 * 出错统一抛 ApiFailure，按 kind 区分：没登录、连不上网、登录尝试太多、服务器出错。
 */

export type FailureKind = "unauthorized" | "network" | "rate-limited" | "server"

export class ApiFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    /** 登录尝试太多时，多少秒后可以再试 */
    readonly retryAfter?: number
  ) {
    super(message)
    this.name = "ApiFailure"
  }
}

const TIMEOUT_MS = 20_000

/** 读响应内容：不是合法 JSON 算服务器的问题，读到一半断网或超时算连不上 */
async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch (cause) {
    if (cause instanceof SyntaxError) throw new ApiFailure("server", getT().auth.api.serverError(response.status))
    throw new ApiFailure("network", getT().auth.api.network)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  // 超时要盖住读内容：服务器发完响应头就卡住时也按时放弃
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        signal: controller.signal,
        headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      })
    } catch {
      throw new ApiFailure("network", getT().auth.api.network)
    }
    if (response.ok) return response.status === 204 ? (undefined as T) : await readJson<T>(response)
    // 服务器返回的错误原文是给程序看的，界面上按状态码换成当前语言的话；只取等待秒数
    const body = await readJson<ApiError>(response).catch(() => null)
    if (response.status === 401) throw new ApiFailure("unauthorized", getT().auth.api.unauthorized)
    if (response.status === 429) throw new ApiFailure("rate-limited", getT().auth.api.rateLimited, body?.retryAfter)
    throw new ApiFailure("server", getT().auth.api.serverError(response.status))
  } finally {
    clearTimeout(timer)
  }
}

export function getSession(): Promise<SessionResponse> {
  return request<SessionResponse>(API_PATHS.session)
}

export function login(password: string): Promise<SessionResponse> {
  return request<SessionResponse>(API_PATHS.session, { method: "POST", body: JSON.stringify({ password }) })
}

export function logout(): Promise<void> {
  return request<void>(API_PATHS.session, { method: "DELETE" })
}

/** 拉取顺序号 since 之后的记录，一页最多 limit 条 */
export function pull(since: number, limit: number): Promise<PullResponse> {
  return request<PullResponse>(`${API_PATHS.sync}?since=${since}&limit=${limit}`)
}

export function push(changes: SyncChange[]): Promise<PushResponse> {
  const body: PushRequest = { changes }
  return request<PushResponse>(API_PATHS.sync, { method: "POST", body: JSON.stringify(body) })
}

export function listTokens(): Promise<TokenInfo[]> {
  return request<TokenInfo[]>(API_PATHS.tokens)
}

export function createToken(name: string): Promise<CreatedToken> {
  return request<CreatedToken>(API_PATHS.tokens, { method: "POST", body: JSON.stringify({ name }) })
}

export function revokeToken(id: string): Promise<void> {
  return request<void>(`${API_PATHS.tokens}/${encodeURIComponent(id)}`, { method: "DELETE" })
}
