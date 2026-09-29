// 仅由口令会话或 Cloudflare Access 身份管理个人令牌。
import { apiError, jsonResponse, noContent, readJsonBody } from "../http"
import type { WorkerEnv } from "../types"
import { createToken, listTokens, revokeToken } from "../db/tokens"
import { validateTokenInput } from "../validation"

export async function list(env: WorkerEnv): Promise<Response> {
  return jsonResponse(await listTokens(env.DB))
}

export async function create(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = validateTokenInput(body.value)
  if (!parsed.ok) return apiError(parsed.error, 400)
  return jsonResponse(await createToken(env.DB, parsed.value.name), 201)
}

export async function revoke(env: WorkerEnv, id: string): Promise<Response> {
  await revokeToken(env.DB, id)
  return noContent()
}
