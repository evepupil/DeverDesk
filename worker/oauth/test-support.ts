// OAuth 测试共用：内存 D1、固定时间、假的外部读取、走一遍「登记 → 允许 → 换令牌」的小工具。
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import type { WorkerEnv } from "../types"
import type { TokenTier } from "../../src/sync/protocol"
import type { Fetcher, OAuthDependencies } from "./clients/types"
import { decideAuthorization } from "./endpoints/consent"
import { handleOAuthRequest } from "./index"
import { s256 } from "./rules/pkce"

export const ORIGIN = "https://desk.test"
export const RESOURCE = `${ORIGIN}/mcp`
export const NOW = Date.UTC(2026, 9, 2, 12)
export const VERIFIER = "Kq3-x_9.~Zr1Lm8Np2Qs7Tu4Vw6Xy0Ab5Cd3Ef9Gh1Ij"
export const CHATGPT_ID = "https://chatgpt.com/oauth/client.json"
export const CHATGPT_REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect"

export interface TestEnv extends WorkerEnv {
  DB: ReturnType<typeof createTestD1>
}

export function oauthEnv(): TestEnv {
  const assets = {
    fetch: async () => new Response("<html>authorize</html>", { headers: { "Content-Type": "text/html", ETag: "x" } }),
  }
  return { DB: createTestD1(), ASSETS: assets } as unknown as TestEnv
}

/** 按网址返回准备好的 JSON；没准备的网址当作连不上 */
export function fakeFetch(documents: Record<string, unknown>, calls: string[] = []): Fetcher {
  return async (input) => {
    calls.push(input)
    if (!(input in documents)) throw new TypeError("network unreachable")
    return new Response(JSON.stringify(documents[input]), { headers: { "Content-Type": "application/json" } })
  }
}

export const CHATGPT_DOCUMENT = {
  client_id: CHATGPT_ID,
  redirect_uris: [CHATGPT_REDIRECT],
  token_endpoint_auth_method: "private_key_jwt",
  token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
  client_name: "ChatGPT",
}

export function testDeps(options: { now?: () => number; fetch?: Fetcher } = {}): OAuthDependencies {
  return {
    now: options.now ?? (() => NOW),
    fetch: options.fetch ?? fakeFetch({ [CHATGPT_ID]: CHATGPT_DOCUMENT }),
  }
}

/** 授权页地址里 ? 后面的那段 */
export async function authorizeQuery(overrides: Record<string, string | null> = {}): Promise<string> {
  const params = new URLSearchParams()
  const values: Record<string, string | null> = {
    response_type: "code",
    client_id: CHATGPT_ID,
    redirect_uri: CHATGPT_REDIRECT,
    code_challenge: await s256(VERIFIER),
    code_challenge_method: "S256",
    state: "state-123",
    scope: "mcp",
    resource: RESOURCE,
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) params.set(key, value)
  }
  return params.toString()
}

/** 用户在授权页上点了允许或拒绝，返回跳回地址 */
export async function decide(
  env: TestEnv,
  deps: OAuthDependencies,
  query: string,
  options: { decision?: "allow" | "deny"; tier?: TokenTier; origin?: string | null } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const origin = options.origin === undefined ? ORIGIN : options.origin
  if (origin !== null) headers.Origin = origin
  return decideAuthorization(new Request(`${ORIGIN}/api/oauth/authorize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, decision: options.decision ?? "allow", tier: options.tier ?? "propose" }),
  }), env, deps)
}

/** 允许之后跳回地址里的授权码 */
export async function approveAndGetCode(
  env: TestEnv,
  deps: OAuthDependencies,
  query?: string,
  tier: TokenTier = "propose",
): Promise<string> {
  const response = await decide(env, deps, query ?? await authorizeQuery(), { tier })
  const body = await response.json() as { status: string; redirectTo?: string }
  if (body.status !== "redirect" || !body.redirectTo) throw new Error(`approval failed: ${JSON.stringify(body)}`)
  const code = new URL(body.redirectTo).searchParams.get("code")
  if (!code) throw new Error(`no code in ${body.redirectTo}`)
  return code
}

/** 往 /oauth/* 发一个表单请求 */
export function postForm(
  env: TestEnv,
  deps: OAuthDependencies,
  path: string,
  form: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response | null> {
  return handleOAuthRequest(new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(form).toString(),
  }), env, deps)
}

export interface TokenSet {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
}

/** 授权码换令牌 */
export async function exchangeCode(
  env: TestEnv,
  deps: OAuthDependencies,
  code: string,
  overrides: Record<string, string> = {},
): Promise<Response> {
  const response = await postForm(env, deps, "/oauth/token", {
    grant_type: "authorization_code",
    code,
    redirect_uri: CHATGPT_REDIRECT,
    client_id: CHATGPT_ID,
    code_verifier: VERIFIER,
    resource: RESOURCE,
    ...overrides,
  })
  if (!response) throw new Error("token endpoint not routed")
  return response
}

/** 从允许到拿到令牌走一遍（ChatGPT 的身份） */
export async function connect(env: TestEnv, deps: OAuthDependencies, tier: TokenTier = "propose"): Promise<TokenSet> {
  const code = await approveAndGetCode(env, deps, undefined, tier)
  const response = await exchangeCode(env, deps, code)
  if (response.status !== 200) throw new Error(`exchange failed: ${await response.text()}`)
  return await response.json() as TokenSet
}

export async function refresh(
  env: TestEnv,
  deps: OAuthDependencies,
  refreshToken: string,
  overrides: Record<string, string> = {},
): Promise<Response> {
  const response = await postForm(env, deps, "/oauth/token", {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CHATGPT_ID,
    ...overrides,
  })
  if (!response) throw new Error("token endpoint not routed")
  return response
}
