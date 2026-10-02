// /api/oauth/authorize：授权页背后的两个接口。只认口令登录和 Access（在 routes/index.ts 里校验过身份）。
// GET 检查授权请求、给出要显示的名字和网站；POST 再整份检查一遍，按用户的选择发授权码或带 access_denied 跳回。
import {
  TOKEN_TIERS,
  type AuthorizeDecisionRequest,
  type AuthorizeResponse,
  type TokenTier,
} from "../../../src/sync/protocol"
import { apiError, jsonResponse, readJsonBody } from "../../http"
import type { WorkerEnv } from "../../types"
import {
  checkAuthorizationRequest,
  errorRedirect,
  issueAuthorizationCode,
  successRedirect,
  type AuthorizationCheck,
} from "../authorize"
import { resolveClient } from "../clients/resolve"
import type { OAuthDependencies } from "../clients/types"
import { publicOrigin } from "../config"
import { isLoopbackRedirectUri, redirectUriHost } from "../rules/redirect-uri"

/** 授权页地址里 ? 后面那段的长度上限 */
const MAX_QUERY_LENGTH = 8 * 1024

function toResponse(check: Exclude<AuthorizationCheck, { kind: "ok" }>): AuthorizeResponse {
  return check.kind === "invalid"
    ? { status: "invalid", reason: check.reason }
    : { status: "redirect", redirectTo: check.redirectTo }
}

function check(params: URLSearchParams, origin: string, env: WorkerEnv, deps: OAuthDependencies): Promise<AuthorizationCheck> {
  return checkAuthorizationRequest(params, origin, (clientId) => resolveClient(env.DB, clientId, deps.fetch))
}

export async function describeAuthorization(request: Request, env: WorkerEnv, deps: OAuthDependencies): Promise<Response> {
  const origin = publicOrigin(request, env)
  const result = await check(new URL(request.url).searchParams, origin, env, deps)
  if (result.kind !== "ok") return jsonResponse(toResponse(result))
  const body: AuthorizeResponse = {
    status: "ok",
    client: {
      name: result.request.client.name,
      host: redirectUriHost(result.request.redirectUri),
      loopback: isLoopbackRedirectUri(result.request.redirectUri),
    },
  }
  return jsonResponse(body)
}

function isTier(value: unknown): value is TokenTier {
  return TOKEN_TIERS.some((tier) => tier === value)
}

function parseDecision(value: unknown): AuthorizeDecisionRequest | null {
  if (typeof value !== "object" || value === null) return null
  const { query, decision, tier } = value as Record<string, unknown>
  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) return null
  if (decision !== "allow" && decision !== "deny") return null
  if (!isTier(tier)) return null
  return { query, decision, tier }
}

export async function decideAuthorization(request: Request, env: WorkerEnv, deps: OAuthDependencies): Promise<Response> {
  const origin = publicOrigin(request, env)
  // 防跨站提交：只收本站页面发来的 JSON
  if (request.headers.get("Origin") !== origin) return apiError("只能从本站的授权页提交", 403)
  const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase()
  if (contentType !== "application/json") return apiError("请求体必须是 JSON", 415)
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const decision = parseDecision(body.value)
  if (!decision) return apiError("授权请求的内容不对", 400)

  const result = await check(new URLSearchParams(decision.query), origin, env, deps)
  if (result.kind !== "ok") return jsonResponse(toResponse(result))

  if (decision.decision === "deny") {
    const redirectTo = errorRedirect(result.request.redirectUri, "access_denied", "The user denied the request.", result.request.state, origin)
    return jsonResponse({ status: "redirect", redirectTo } satisfies AuthorizeResponse)
  }
  const code = await issueAuthorizationCode(env.DB, result.request, decision.tier, deps.now())
  return jsonResponse({ status: "redirect", redirectTo: successRedirect(result.request, code, origin) } satisfies AuthorizeResponse)
}
