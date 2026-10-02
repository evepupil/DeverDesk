// 授权请求的检查、发授权码、拼跳回地址。规则见 docs/模块设计/OAuth授权.md「授权请求的检查」。
import type { AuthorizeInvalidReason, TokenTier } from "../../src/sync/protocol"
import { randomBase64Url, sha256Hex } from "../auth/crypto"
import { CODE_TTL_MS, PREFIX, resourceOf } from "./config"
import { single } from "./http"
import type { ClientLookup, ResolvedClient } from "./clients/types"
import { isValidCodeChallenge } from "./rules/pkce"
import { appendQuery, matchesRegisteredRedirectUri, redirectUriHost } from "./rules/redirect-uri"
import { grantedScope, isOwnResource } from "./rules/scope"
import { insertCode } from "./store/codes"
import { deleteExpired } from "./store/maintenance"

export const MAX_STATE_LENGTH = 1024

/** 检查通过的授权请求 */
export interface AuthorizationRequest {
  client: ResolvedClient
  redirectUri: string
  codeChallenge: string
  state: string | null
  scope: string
  resource: string
}

/**
 * 三种结果：
 * - invalid：客户端或跳回地址有问题，不能往那个地址跳，授权页显示原因；
 * - redirect：跳回地址核对过了，别的问题带着 OAuth 错误码跳回去；
 * - ok：可以让用户选权限、点允许。
 */
export type AuthorizationCheck =
  | { kind: "ok"; request: AuthorizationRequest }
  | { kind: "invalid"; reason: AuthorizeInvalidReason }
  | { kind: "redirect"; redirectTo: string }

type RedirectError = "invalid_request" | "unsupported_response_type" | "invalid_target" | "access_denied"

/** 带错误跳回：错误码、说明、原样的 state、授权方是谁（iss） */
export function errorRedirect(
  redirectUri: string,
  error: RedirectError,
  description: string,
  state: string | null,
  origin: string,
): string {
  return appendQuery(redirectUri, { error, error_description: description, state, iss: origin })
}

export function successRedirect(request: AuthorizationRequest, code: string, origin: string): string {
  return appendQuery(request.redirectUri, { code, state: request.state, iss: origin })
}

export async function checkAuthorizationRequest(
  params: URLSearchParams,
  origin: string,
  lookup: (clientId: string) => Promise<ClientLookup>,
): Promise<AuthorizationCheck> {
  const clientId = single(params, "client_id")
  if (!clientId) return { kind: "invalid", reason: "client_id" }
  const found = await lookup(clientId)
  if (!found.ok) return { kind: "invalid", reason: found.reason }

  const redirectUri = single(params, "redirect_uri")
  if (!redirectUri || !matchesRegisteredRedirectUri(redirectUri, found.client.redirectUris)) {
    return { kind: "invalid", reason: "redirect_uri" }
  }

  // 跳回地址核对过了：往后的问题都带着错误码跳回去
  const state = single(params, "state")
  const fail = (error: RedirectError, description: string, keepState = true): AuthorizationCheck => ({
    kind: "redirect",
    redirectTo: errorRedirect(redirectUri, error, description, keepState && typeof state === "string" ? state : null, origin),
  })
  if (state === undefined) return fail("invalid_request", "state may appear only once.", false)
  if (state !== null && state.length > MAX_STATE_LENGTH) return fail("invalid_request", "state is too long.", false)

  if (single(params, "response_type") !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.")
  }
  const challenge = single(params, "code_challenge")
  if (single(params, "code_challenge_method") !== "S256" || !challenge || !isValidCodeChallenge(challenge)) {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.")
  }

  const resource = resourceOf(origin)
  const requestedResources = params.getAll("resource")
  if (requestedResources.length > 1 || !isOwnResource(requestedResources[0] ?? null, resource)) {
    return fail("invalid_target", `resource must be ${resource}.`)
  }
  const scope = single(params, "scope")
  if (scope === undefined) return fail("invalid_request", "scope may appear only once.")

  return {
    kind: "ok",
    request: { client: found.client, redirectUri, codeChallenge: challenge, state, scope: grantedScope(scope), resource },
  }
}

/**
 * 连接列表上显示的网站：读身份说明认的客户端用说明所在的域名（Claude Code 显示 claude.ai，
 * 比本机的回调地址好认）；自助登记的用跳回地址的网站。
 */
export function clientHostOf(request: AuthorizationRequest): string {
  if (request.client.source !== "registered") return new URL(request.client.id).hostname
  return redirectUriHost(request.redirectUri)
}

/** 用户点了允许：发授权码（库里只存摘要），顺手清掉过期的授权码、令牌和连接 */
export async function issueAuthorizationCode(
  db: D1Database,
  request: AuthorizationRequest,
  tier: TokenTier,
  now: number,
): Promise<string> {
  const code = `${PREFIX.code}${randomBase64Url(32)}`
  await deleteExpired(db, now)
  await insertCode(db, {
    hash: await sha256Hex(code),
    clientId: request.client.id,
    clientName: request.client.name,
    clientHost: clientHostOf(request),
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    scope: request.scope,
    tier,
    expiresAt: now + CODE_TTL_MS,
  })
  return code
}
