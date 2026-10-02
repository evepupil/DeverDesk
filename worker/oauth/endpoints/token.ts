// POST /oauth/token：授权码换令牌、续期令牌换新。规则见 docs/模块设计/OAuth授权.md「换令牌」。
import { randomBase64Url, sha256Hex } from "../../auth/crypto"
import type { WorkerEnv } from "../../types"
import { ACCESS_TOKEN_TTL_SECONDS, PREFIX, REFRESH_IDLE_MS, REFRESH_REUSE_LEEWAY_MS, SECRET_PATTERN } from "../config"
import { authenticateClient } from "../clients/authenticate"
import type { OAuthDependencies } from "../clients/types"
import { methodNotAllowed, oauthError, oauthJson, preflight, readForm, single } from "../http"
import { verifyCodeVerifier } from "../rules/pkce"
import { canonicalResource, isScopeWithin } from "../rules/scope"
import { touchRegisteredClient } from "../store/clients"
import { findCode } from "../store/codes"
import {
  addAccessToken,
  deleteGrant,
  exchangeCodeForGrant,
  findGrant,
  findGrantByRefreshHash,
  rotateFromCurrent,
  rotateFromPrevious,
  type Rotation,
} from "../store/grants"

function newSecret(prefix: string): string {
  return `${prefix}${randomBase64Url(32)}`
}

function hasShape(value: string, prefix: string): boolean {
  return value.startsWith(prefix) && SECRET_PATTERN.test(value.slice(prefix.length))
}

function invalidGrant(description: string): Response {
  return oauthError("invalid_grant", description)
}

function tokenResponse(accessToken: string, refreshToken: string, scope: string): Response {
  return oauthJson({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  })
}

/** 带了 resource 就必须指向授权时绑定的那个；最多一个 */
function resourceMismatch(params: URLSearchParams, bound: string): Response | null {
  const requested = params.getAll("resource")
  if (requested.length === 0) return null
  if (requested.length === 1 && canonicalResource(requested[0]!) === bound) return null
  return oauthError("invalid_target", `resource must be ${bound}.`)
}

async function exchangeAuthorizationCode(
  db: D1Database,
  params: URLSearchParams,
  client: { clientId: string; registered: boolean },
  now: number,
): Promise<Response> {
  const code = single(params, "code")
  const redirectUri = single(params, "redirect_uri")
  const verifier = single(params, "code_verifier")
  if (!code || !redirectUri || !verifier) {
    return oauthError("invalid_request", "code, redirect_uri and code_verifier are required, each exactly once.")
  }
  if (!hasShape(code, PREFIX.code)) return invalidGrant("The authorization code is not valid.")

  const codeHash = await sha256Hex(code)
  const record = await findCode(db, codeHash)
  if (!record) return invalidGrant("The authorization code is not valid.")
  if (record.grantId !== null) {
    // 授权码被第二次使用：可能被截走了，把用它建出的连接和令牌一起收回
    await deleteGrant(db, record.grantId)
    return invalidGrant("The authorization code was already used; the connection it created has been revoked.")
  }
  if (record.expiresAt <= now) return invalidGrant("The authorization code has expired.")
  if (record.clientId !== client.clientId) return invalidGrant("The authorization code was issued to another client.")
  if (record.redirectUri !== redirectUri) return invalidGrant("redirect_uri does not match the authorization request.")
  if (!(await verifyCodeVerifier(verifier, record.codeChallenge))) {
    return invalidGrant("code_verifier does not match the code_challenge.")
  }
  const mismatch = resourceMismatch(params, record.resource)
  if (mismatch) return mismatch

  const accessToken = newSecret(PREFIX.access)
  const refreshToken = newSecret(PREFIX.refresh)
  const created = await exchangeCodeForGrant(db, {
    codeHash,
    grant: {
      id: `${PREFIX.grant}${randomBase64Url(18)}`,
      clientId: client.clientId,
      clientName: record.clientName,
      clientHost: record.clientHost,
      tier: record.tier,
      resource: record.resource,
      scope: record.scope,
      refreshHash: await sha256Hex(refreshToken),
      refreshExpiresAt: now + REFRESH_IDLE_MS,
    },
    accessHash: await sha256Hex(accessToken),
    accessExpiresAt: now + ACCESS_TOKEN_TTL_SECONDS * 1000,
    now,
  })
  if (!created) {
    // 同一个授权码同时来了两次、被另一个请求抢先换走了：同样当作重复使用，把抢先建出的连接收回
    const latest = await findCode(db, codeHash)
    if (latest?.grantId) await deleteGrant(db, latest.grantId)
    return invalidGrant("The authorization code was already used; the connection it created has been revoked.")
  }
  if (client.registered) await touchRegisteredClient(db, client.clientId, now)
  return tokenResponse(accessToken, refreshToken, record.scope)
}

/** 上一张续期令牌是不是刚换下不久，还允许拿来重试 */
function withinReuseLeeway(rotatedAt: number | null, now: number): boolean {
  return rotatedAt !== null && now - rotatedAt <= REFRESH_REUSE_LEEWAY_MS
}

async function refreshTokens(
  db: D1Database,
  params: URLSearchParams,
  client: { clientId: string; registered: boolean },
  now: number,
): Promise<Response> {
  const clientId = client.clientId
  const presented = single(params, "refresh_token")
  if (!presented) return oauthError("invalid_request", "refresh_token is required, exactly once.")
  if (!hasShape(presented, PREFIX.refresh)) return invalidGrant("The refresh token is not valid.")

  const presentedHash = await sha256Hex(presented)
  const grant = await findGrantByRefreshHash(db, presentedHash)
  if (!grant) return invalidGrant("The refresh token is not valid.")
  if (grant.refreshExpiresAt <= now) {
    await deleteGrant(db, grant.id)
    return invalidGrant("The refresh token has expired.")
  }
  if (grant.clientId !== clientId) return invalidGrant("The refresh token was issued to another client.")
  const mismatch = resourceMismatch(params, grant.resource)
  if (mismatch) return mismatch
  const scope = single(params, "scope")
  if (scope === undefined) return oauthError("invalid_request", "scope may appear only once.")
  if (scope !== null && !isScopeWithin(scope, grant.scope)) {
    return oauthError("invalid_scope", "The requested scope exceeds the original grant.")
  }

  const isCurrent = grant.refreshHash === presentedHash
  if (!isCurrent && !withinReuseLeeway(grant.rotatedAt, now)) {
    // 换下来好一阵的旧续期令牌又被拿来用：多半是被盗了，整条连接作废，拿着新令牌的一方也要重新授权
    await deleteGrant(db, grant.id)
    return invalidGrant("This refresh token was already used; the connection has been revoked.")
  }

  const refreshToken = newSecret(PREFIX.refresh)
  const rotation: Rotation = {
    grantId: grant.id,
    presentedHash,
    newRefreshHash: await sha256Hex(refreshToken),
    refreshExpiresAt: now + REFRESH_IDLE_MS,
    now,
  }
  const notBefore = now - REFRESH_REUSE_LEEWAY_MS
  let rotated = isCurrent ? await rotateFromCurrent(db, rotation) : await rotateFromPrevious(db, rotation, notBefore)
  if (!rotated) {
    // 另一个续期请求抢先改了：这张如果刚好成了「上一张」，按上一张再试一次
    const latest = await findGrant(db, grant.id)
    if (latest?.previousRefreshHash === presentedHash) rotated = await rotateFromPrevious(db, rotation, notBefore)
  }
  if (!rotated) return invalidGrant("The refresh token is no longer valid.")

  const accessToken = newSecret(PREFIX.access)
  await addAccessToken(db, grant.id, await sha256Hex(accessToken), now + ACCESS_TOKEN_TTL_SECONDS * 1000, now)
  if (client.registered) await touchRegisteredClient(db, clientId, now)
  return tokenResponse(accessToken, refreshToken, grant.scope)
}

export async function handleToken(request: Request, env: WorkerEnv, deps: OAuthDependencies): Promise<Response> {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS")
  const form = await readForm(request)
  if (!form.ok) return form.response
  const params = form.value

  const client = await authenticateClient(env.DB, request, params)
  if (!client.ok) return client.response

  const grantType = single(params, "grant_type")
  const now = deps.now()
  if (grantType === "authorization_code") return exchangeAuthorizationCode(env.DB, params, client, now)
  if (grantType === "refresh_token") return refreshTokens(env.DB, params, client, now)
  if (!grantType) return oauthError("invalid_request", "grant_type is required, exactly once.")
  return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported.")
}
