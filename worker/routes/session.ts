// 登录状态、口令校验、失败限速与会话 Cookie 管理。
import type { SessionResponse } from "../../src/sync/protocol"
import { apiError, jsonResponse, noContent, readJsonBody } from "../http"
import type { WorkerContext, WorkerEnv } from "../types"
import { constantTimeEqual, utf8Encoder } from "../auth/crypto"
import { issueSessionToken, SESSION_MAX_AGE_SECONDS } from "../auth/session"
import { resolveAuthentication } from "../auth"
import { loadSessionSecret } from "../db/settings"
import { validateLoginRequest } from "../validation"

const FAILURE_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 10
const SESSION_COOKIE = "dd_session"

function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
}

export async function getSession(request: Request, env: WorkerEnv, context: WorkerContext): Promise<Response> {
  const auth = await resolveAuthentication(request, env, context)
  const body: SessionResponse = {
    authenticated: auth !== null,
    via: auth?.via ?? null,
    passwordEnabled: Boolean(env.DEVERDESK_PASSWORD),
  }
  return jsonResponse(body)
}

export async function login(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = validateLoginRequest(body.value)
  if (!parsed.ok) return apiError(parsed.error, 400)
  const password = env.DEVERDESK_PASSWORD
  if (!password) return apiError("还没有设置登录口令", 503)

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown"
  const now = Date.now()
  const failure = await env.DB.prepare("SELECT count, window_start FROM login_failures WHERE ip = ? LIMIT 1")
    .bind(ip)
    .first<{ count: number; window_start: number }>()
  if (failure && failure.window_start + FAILURE_WINDOW_MS > now && failure.count >= MAX_FAILURES) {
    const retryAfter = Math.max(1, Math.ceil((failure.window_start + FAILURE_WINDOW_MS - now) / 1000))
    return apiError("尝试太多次，请稍后再试", 429, retryAfter)
  }

  const matches = constantTimeEqual(utf8Encoder.encode(password), utf8Encoder.encode(parsed.value.password))
  if (!matches) {
    const cutoff = now - FAILURE_WINDOW_MS
    const updated = await env.DB.prepare(
      "INSERT INTO login_failures (ip, count, window_start) VALUES (?, 1, ?) " +
      "ON CONFLICT(ip) DO UPDATE SET " +
      "count = CASE WHEN login_failures.window_start <= ? THEN 1 ELSE login_failures.count + 1 END, " +
      "window_start = CASE WHEN login_failures.window_start <= ? THEN excluded.window_start ELSE login_failures.window_start END " +
      "RETURNING count, window_start"
    ).bind(ip, now, cutoff, cutoff).first<{ count: number; window_start: number }>()
    if (!updated) throw new Error("login failure counter returned no row")
    if (updated.count > MAX_FAILURES) {
      const retryAfter = Math.max(1, Math.ceil((updated.window_start + FAILURE_WINDOW_MS - now) / 1000))
      return apiError("尝试太多次，请稍后再试", 429, retryAfter)
    }
    return apiError("口令不对", 401)
  }

  await env.DB.prepare("DELETE FROM login_failures WHERE ip = ?").bind(ip).run()
  const token = await issueSessionToken({ secret: await loadSessionSecret(env.DB), password }, now)
  const response: SessionResponse = { authenticated: true, via: "password", passwordEnabled: true }
  return jsonResponse(response, 200, { "Set-Cookie": sessionCookie(token, SESSION_MAX_AGE_SECONDS) })
}

export function logout(): Response {
  return noContent({ "Set-Cookie": sessionCookie("", 0) })
}
