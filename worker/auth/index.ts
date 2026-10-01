// 按 Access、个人令牌、口令会话顺序解析当前请求身份。
import type { AuthContext, TokenIdentity, WorkerContext, WorkerEnv } from "../types"
import { loadSessionSecret } from "../db/settings"
import { findTokenIdentity } from "../db/tokens"
import { verifyAccessAssertion } from "./access"
import { verifySessionToken } from "./session"

export function accessIsConfigured(env: WorkerEnv): boolean {
  return Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD)
}

export function loginIsConfigured(env: WorkerEnv): boolean {
  return Boolean(env.DEVERDESK_PASSWORD || accessIsConfigured(env))
}

function sessionCookie(request: Request): string | null {
  const cookie = request.headers.get("Cookie")
  if (!cookie) return null
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0 || part.slice(0, separator).trim() !== "dd_session") continue
    return part.slice(separator + 1).trim()
  }
  return null
}

/** 只看 Authorization: Bearer 访问令牌；/mcp 只认这一种，其余接口在 Access 之后、Cookie 之前认它 */
export async function resolveBearerToken(request: Request, env: WorkerEnv): Promise<TokenIdentity | null> {
  const authorization = request.headers.get("Authorization")
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!bearer) return null
  return findTokenIdentity(env.DB, bearer)
}

export async function resolveAuthentication(
  request: Request,
  env: WorkerEnv,
  context: WorkerContext
): Promise<AuthContext | null> {
  if (context.access) return { via: "access" }

  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const assertion = request.headers.get("Cf-Access-Jwt-Assertion")
    if (assertion && await verifyAccessAssertion(assertion, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD)) {
      return { via: "access" }
    }
  }

  const token = await resolveBearerToken(request, env)
  if (token) return { via: "token", token }

  const password = env.DEVERDESK_PASSWORD
  const session = sessionCookie(request)
  if (password && session) {
    const secret = await loadSessionSecret(env.DB)
    if (await verifySessionToken({ secret, password }, session)) return { via: "password" }
  }
  return null
}
