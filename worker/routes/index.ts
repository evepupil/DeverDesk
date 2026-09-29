// 匹配已知 API、验证登录身份并把请求交给对应路由。
import { API_PATHS } from "../../src/sync/protocol"
import { resolveAuthentication, loginIsConfigured } from "../auth"
import { apiError } from "../http"
import type { WorkerContext, WorkerEnv } from "../types"
import { getSession, login, logout } from "./session"
import { pull, push } from "./sync"
import { create, list, revoke } from "./tokens"
import { createLedgerEntry, createTask, getSummary } from "./operations"

function notFound(): Response {
  return apiError("接口不存在", 404)
}

async function dispatchApiRequest(request: Request, env: WorkerEnv, context: WorkerContext): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method.toUpperCase()

  if (pathname === API_PATHS.session) {
    if (method === "GET") return getSession(request, env, context)
    if (method === "POST") return login(request, env)
    if (method === "DELETE") return logout()
    return notFound()
  }

  let route: "pull" | "push" | "token-list" | "token-create" | "token-revoke" | "task-create" | "ledger-create" | "summary" | null = null
  let tokenId: string | null = null
  if (pathname === API_PATHS.sync && method === "GET") route = "pull"
  else if (pathname === API_PATHS.sync && method === "POST") route = "push"
  else if (pathname === API_PATHS.tokens && method === "GET") route = "token-list"
  else if (pathname === API_PATHS.tokens && method === "POST") route = "token-create"
  else if (pathname.startsWith(`${API_PATHS.tokens}/`) && method === "DELETE") {
    const encodedId = pathname.slice(API_PATHS.tokens.length + 1)
    if (!encodedId || encodedId.includes("/")) return notFound()
    try {
      tokenId = decodeURIComponent(encodedId)
    } catch {
      return notFound()
    }
    route = "token-revoke"
  } else if (pathname === API_PATHS.tasks && method === "POST") route = "task-create"
  else if (pathname === API_PATHS.ledger && method === "POST") route = "ledger-create"
  else if (pathname === API_PATHS.summary && method === "GET") route = "summary"
  if (!route) return notFound()

  const auth = await resolveAuthentication(request, env, context)
  if (!auth) return loginIsConfigured(env) ? apiError("需要登录", 401) : apiError("还没有设置登录口令", 503)
  if (route.startsWith("token-") && auth.via === "token") return apiError("个人令牌不能管理令牌", 403)

  switch (route) {
    case "pull":
      return pull(request, env)
    case "push":
      return push(request, env)
    case "token-list":
      return list(env)
    case "token-create":
      return create(request, env)
    case "token-revoke":
      return revoke(env, tokenId!)
    case "task-create":
      return createTask(request, env)
    case "ledger-create":
      return createLedgerEntry(request, env)
    case "summary":
      return getSummary(request, env)
  }
}

export async function dispatchApi(request: Request, env: WorkerEnv, context: WorkerContext): Promise<Response> {
  try {
    return await dispatchApiRequest(request, env, context)
  } catch (error) {
    console.error("API request failed", error)
    return apiError("服务器内部错误", 500)
  }
}
