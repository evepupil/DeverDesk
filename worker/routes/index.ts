// 匹配已知 API、验证登录身份并把请求交给对应路由。
import { API_PATHS } from "../../src/sync/protocol"
import { resolveAuthentication, loginIsConfigured } from "../auth"
import { apiError } from "../http"
import type { WorkerContext, WorkerEnv } from "../types"
import { getSession, login, logout } from "./session"
import { pull, push } from "./sync"
import { create, list, revoke } from "./tokens"
import { createLedgerEntry, createTask, getSummary } from "./operations"
import { matchAiRoute, handleAiRoute, type AiRoute } from "./ai"
import { matchRecorderRoute, handleRecorderRoute, type RecorderRoute } from "../recorder/routes"
import { update as updateToken } from "./tokens"
import type { TokenIdentity } from "../types"
import { decideAuthorization, describeAuthorization } from "../oauth/endpoints/consent"
import { productionOAuthDependencies } from "../oauth/clients/types"

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

  const ai = matchAiRoute(pathname, method)
  const recorder = matchRecorderRoute(pathname, method)
  let route: "pull" | "push" | "token-list" | "token-create" | "token-tier" | "token-revoke" | "task-create" | "ledger-create" | "summary" | "ai" | "recorder" | "oauth-describe" | "oauth-decide" | null = null
  let tokenId: string | null = null
  let aiRoute: AiRoute | null = null
  let recorderRoute: RecorderRoute | null = null
  if (ai) {
    route = "ai"
    aiRoute = ai
  } else if (recorder) {
    route = "recorder"
    recorderRoute = recorder
  } else if (pathname === API_PATHS.sync && method === "GET") route = "pull"
  else if (pathname === API_PATHS.sync && method === "POST") route = "push"
  else if (pathname === API_PATHS.tokens && method === "GET") route = "token-list"
  else if (pathname === API_PATHS.tokens && method === "POST") route = "token-create"
  else if (pathname.startsWith(`${API_PATHS.tokens}/`) && (method === "DELETE" || method === "PATCH")) {
    const encodedId = pathname.slice(API_PATHS.tokens.length + 1)
    if (!encodedId || encodedId.includes("/")) return notFound()
    try {
      tokenId = decodeURIComponent(encodedId)
    } catch {
      return notFound()
    }
    route = method === "DELETE" ? "token-revoke" : "token-tier"
  } else if (pathname === API_PATHS.tasks && method === "POST") route = "task-create"
  else if (pathname === API_PATHS.ledger && method === "POST") route = "ledger-create"
  else if (pathname === API_PATHS.summary && method === "GET") route = "summary"
  else if (pathname === API_PATHS.oauthAuthorize && method === "GET") route = "oauth-describe"
  else if (pathname === API_PATHS.oauthAuthorize && method === "POST") route = "oauth-decide"
  if (!route) return notFound()

  const auth = await resolveAuthentication(request, env, context)
  if (!auth) return loginIsConfigured(env) ? apiError("需要登录", 401) : apiError("还没有设置登录口令", 503)
  if (route.startsWith("token-") && auth.via === "token") return apiError("个人令牌不能管理令牌", 403)
  if (route === "ai" && auth.via === "token") return apiError("个人令牌不能管理 AI 改动", 403)
  if (route.startsWith("oauth-") && auth.via === "token") return apiError("个人令牌不能给 AI 应用授权", 403)
  const recorderWrites = route === "recorder" && (recorderRoute?.kind === "upload" || recorderRoute?.kind === "live-put")
  if ((route === "push" || route === "task-create" || route === "ledger-create" || recorderWrites) && auth.via === "token" && auth.token?.tier !== "write") {
    return apiError("这个令牌需要开启直接改权限", 403)
  }

  const identity: TokenIdentity = auth.via === "token"
    ? auth.token!
    : { id: "session", name: "DeverDesk", tier: "write" }

  switch (route) {
    case "pull":
      return pull(request, env)
    case "push":
      return push(request, env)
    case "token-list":
      return list(env)
    case "token-create":
      return create(request, env)
    case "token-tier":
      return updateToken(request, env, tokenId!)
    case "token-revoke":
      return revoke(env, tokenId!)
    case "task-create":
      return createTask(request, env, identity)
    case "ledger-create":
      return createLedgerEntry(request, env, identity)
    case "summary":
      return getSummary(request, env)
    case "ai":
      return handleAiRoute(request, env, aiRoute!)
    case "recorder":
      return handleRecorderRoute(request, env, identity, recorderRoute!)
    case "oauth-describe":
      return describeAuthorization(request, env, productionOAuthDependencies)
    case "oauth-decide":
      return decideAuthorization(request, env, productionOAuthDependencies)
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
