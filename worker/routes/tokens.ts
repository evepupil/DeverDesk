// 仅由口令会话或 Cloudflare Access 身份管理「连接 AI」列表：手动建的个人令牌和 AI 应用授权来的连接。
import type { TokenInfo } from "../../src/sync/protocol"
import { apiError, jsonResponse, noContent, readJsonBody } from "../http"
import type { WorkerEnv } from "../types"
import { createToken, listTokens, revokeToken, updateTokenTier } from "../db/tokens"
import { deleteGrant, listActiveGrants, updateGrantTier, type GrantRecord } from "../oauth/store/grants"
import { validateTokenInput, validateTokenTierInput } from "../validation"

function grantInfo(grant: GrantRecord): TokenInfo {
  return {
    id: grant.id,
    name: grant.clientName,
    tier: grant.tier,
    createdAt: grant.createdAt,
    lastUsedAt: grant.lastUsedAt,
    kind: "oauth",
    host: grant.clientHost,
  }
}

/** 两种放在一个列表里，新建的在前 */
export async function list(env: WorkerEnv): Promise<Response> {
  const [tokens, grants] = await Promise.all([listTokens(env.DB), listActiveGrants(env.DB, Date.now())])
  const merged = [...tokens, ...grants.map(grantInfo)].sort(
    (left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  )
  return jsonResponse(merged)
}

export async function create(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = validateTokenInput(body.value)
  if (!parsed.ok) return apiError(parsed.error, 400)
  return jsonResponse(await createToken(env.DB, parsed.value.name, parsed.value.tier), 201)
}

/** 改权限：先找个人令牌，找不到再找授权连接；立即生效 */
export async function update(request: Request, env: WorkerEnv, id: string): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = validateTokenTierInput(body.value)
  if (!parsed.ok) return apiError(parsed.error, 400)
  const updated = await updateTokenTier(env.DB, id, parsed.value.tier) || await updateGrantTier(env.DB, id, parsed.value.tier)
  return updated ? jsonResponse({ id, tier: parsed.value.tier }) : apiError("令牌不存在", 404)
}

/** 撤销个人令牌或断开授权连接（连同它的通行令牌），下一次请求就 401 */
export async function revoke(env: WorkerEnv, id: string): Promise<Response> {
  await revokeToken(env.DB, id)
  await deleteGrant(env.DB, id)
  return noContent()
}
