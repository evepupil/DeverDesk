// POST /oauth/revoke（RFC 7009）：续期令牌 → 断开整条连接；通行令牌 → 只作废这一张。找不到也回 200。
import { sha256Hex } from "../../auth/crypto"
import type { WorkerEnv } from "../../types"
import { PREFIX } from "../config"
import { authenticateClient } from "../clients/authenticate"
import { CORS_HEADERS, methodNotAllowed, oauthError, preflight, readForm, single } from "../http"
import { deleteAccessToken, deleteGrant, findAccessToken, findGrantByRefreshHash } from "../store/grants"

export async function handleRevoke(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS")
  const form = await readForm(request)
  if (!form.ok) return form.response
  const client = await authenticateClient(env.DB, request, form.value)
  if (!client.ok) return client.response

  const token = single(form.value, "token")
  if (!token) return oauthError("invalid_request", "token is required, exactly once.")
  const hash = await sha256Hex(token)
  if (token.startsWith(PREFIX.refresh)) {
    const grant = await findGrantByRefreshHash(env.DB, hash)
    if (grant?.clientId === client.clientId) await deleteGrant(env.DB, grant.id)
  } else if (token.startsWith(PREFIX.access)) {
    const found = await findAccessToken(env.DB, hash)
    if (found?.clientId === client.clientId) await deleteAccessToken(env.DB, hash)
  }
  return new Response(null, { status: 200, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } })
}
