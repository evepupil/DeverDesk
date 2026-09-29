// 按 Access、个人令牌、口令会话顺序解析当前请求身份。
import type { AuthContext, WorkerContext, WorkerEnv } from "../types"
import { loadSessionSecret } from "../db/settings"
import { sha256Hex } from "./crypto"
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

  const authorization = request.headers.get("Authorization")
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer && /^dd_[A-Za-z0-9_-]{43}$/.test(bearer)) {
    const hash = await sha256Hex(bearer)
    const token = await env.DB.prepare("SELECT id, last_used_at FROM tokens WHERE hash = ? LIMIT 1")
      .bind(hash)
      .first<{ id: string; last_used_at: number | null }>()
    if (token) {
      const now = Date.now()
      if (token.last_used_at === null || token.last_used_at <= now - 60_000) {
        await env.DB.prepare("UPDATE tokens SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= ?)")
          .bind(now, token.id, now - 60_000)
          .run()
      }
      return { via: "token", tokenId: token.id }
    }
  }

  const password = env.DEVERDESK_PASSWORD
  const session = sessionCookie(request)
  if (password && session) {
    const secret = await loadSessionSecret(env.DB)
    if (await verifySessionToken({ secret, password }, session)) return { via: "password" }
  }
  return null
}
