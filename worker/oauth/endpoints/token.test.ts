import { describe, expect, it } from "vitest"
import { sha256Hex } from "../../auth/crypto"
import { handleOAuthRequest } from "../index"
import {
  CHATGPT_ID,
  NOW,
  ORIGIN,
  approveAndGetCode,
  connect,
  exchangeCode,
  oauthEnv,
  postForm,
  refresh,
  testDeps,
  type TokenSet,
} from "../test-support"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

async function errorOf(response: Response): Promise<string> {
  return (await response.json() as { error: string }).error
}

describe("授权码换令牌", () => {
  it("换出通行令牌和续期令牌；建一条连接，带上选的权限；库里只有摘要", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const code = await approveAndGetCode(env, deps, undefined, "write")
    const response = await exchangeCode(env, deps, code)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    const tokens = await response.json() as TokenSet
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp" })
    expect(tokens.access_token).toMatch(/^ddo_[A-Za-z0-9_-]{43}$/)
    expect(tokens.refresh_token).toMatch(/^ddr_[A-Za-z0-9_-]{43}$/)

    const grants = env.DB.rows<Record<string, unknown>>("SELECT * FROM oauth_grants")
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatchObject({
      client_id: CHATGPT_ID,
      client_name: "ChatGPT",
      client_host: "chatgpt.com",
      tier: "write",
      resource: `${ORIGIN}/mcp`,
      scope: "mcp",
      refresh_hash: await sha256Hex(tokens.refresh_token),
      previous_refresh_hash: null,
      refresh_expires_at: NOW + 30 * DAY,
      created_at: NOW,
    })
    expect(env.DB.rows("SELECT hash, expires_at FROM oauth_tokens")).toEqual([
      { hash: await sha256Hex(tokens.access_token), expires_at: NOW + HOUR },
    ])
    expect(env.DB.rows("SELECT grant_id FROM oauth_codes")).toEqual([{ grant_id: grants[0]!.id }])
  })

  it("授权码第二次使用：拒绝，并把第一次换出的连接和令牌一起收回", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const code = await approveAndGetCode(env, deps)
    expect((await exchangeCode(env, deps, code)).status).toBe(200)
    const again = await exchangeCode(env, deps, code)
    expect(again.status).toBe(400)
    expect(await errorOf(again)).toBe("invalid_grant")
    expect(env.DB.rows("SELECT id FROM oauth_grants")).toEqual([])
    expect(env.DB.rows("SELECT hash FROM oauth_tokens")).toEqual([])
  })

  it("过期、原文不对、跳回地址不同、客户端不同、资源不同都换不出来", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const expired = await approveAndGetCode(env, deps)
    expect(await errorOf(await exchangeCode(env, testDeps({ now: () => NOW + 5 * 60 * 1000 }), expired))).toBe("invalid_grant")

    const cases: Array<[Record<string, string>, string]> = [
      [{ code_verifier: `${"z".repeat(43)}` }, "invalid_grant"],
      [{ redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect/" }, "invalid_grant"],
      [{ client_id: "https://chatgpt.com/oauth/codex/client.json" }, "invalid_grant"],
      [{ resource: "https://other.test/mcp" }, "invalid_target"],
      [{ code: "ddc_not-a-real-code" }, "invalid_grant"],
      [{ code: "" }, "invalid_request"],
      [{ code_verifier: "" }, "invalid_request"],
    ]
    for (const [overrides, error] of cases) {
      const code = await approveAndGetCode(env, deps)
      const response = await exchangeCode(env, deps, code, overrides)
      expect({ overrides, error: await errorOf(response) }).toEqual({ overrides, error })
    }
    expect(env.DB.rows("SELECT id FROM oauth_grants")).toEqual([])
  })

  it("不带 PKCE 原文换不出来（防降级）", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const code = await approveAndGetCode(env, deps)
    const response = await postForm(env, deps, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
      client_id: CHATGPT_ID,
    })
    expect(await errorOf(response!)).toBe("invalid_request")
  })

  it("请求格式：只收表单 POST，没带客户端编号 401，不认识的授权方式报 unsupported_grant_type", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const json = await handleOAuthRequest(new Request(`${ORIGIN}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code" }),
    }), env, deps)
    expect(await errorOf(json!)).toBe("invalid_request")

    const get = await handleOAuthRequest(new Request(`${ORIGIN}/oauth/token`), env, deps)
    expect(get!.status).toBe(405)
    const options = await handleOAuthRequest(new Request(`${ORIGIN}/oauth/token`, { method: "OPTIONS" }), env, deps)
    expect(options!.status).toBe(204)
    expect(options!.headers.get("access-control-allow-origin")).toBe("*")

    const anonymous = await postForm(env, deps, "/oauth/token", { grant_type: "authorization_code", code: "x" })
    expect(anonymous!.status).toBe(401)
    expect(await errorOf(anonymous!)).toBe("invalid_client")

    const password = await postForm(env, deps, "/oauth/token", { grant_type: "password", client_id: CHATGPT_ID })
    expect(await errorOf(password!)).toBe("unsupported_grant_type")
  })
})

describe("续期", () => {
  it("用当前那张：换出新的一对；上一张在新的第一次使用前仍然有效，之后作废", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const first = await connect(env, deps)

    const second = await refresh(env, testDeps({ now: () => NOW + DAY }), first.refresh_token)
    expect(second.status).toBe(200)
    const secondTokens = await second.json() as TokenSet
    expect(secondTokens.refresh_token).not.toBe(first.refresh_token)
    expect(secondTokens.access_token).not.toBe(first.access_token)
    expect(env.DB.rows("SELECT refresh_expires_at, last_used_at FROM oauth_grants")).toEqual([
      { refresh_expires_at: NOW + 31 * DAY, last_used_at: NOW + DAY },
    ])

    // 客户端没收到第二次的结果，拿第一张再来：仍然可以
    const retried = await refresh(env, testDeps({ now: () => NOW + DAY + 1000 }), first.refresh_token)
    expect(retried.status).toBe(200)
    const retriedTokens = await retried.json() as TokenSet

    // 用了最新的那张之后，第一张作废
    expect((await refresh(env, deps, retriedTokens.refresh_token)).status).toBe(200)
    expect(await errorOf(await refresh(env, deps, first.refresh_token))).toBe("invalid_grant")
    // 被跳过的那张（第二次发的）也不能用
    expect(await errorOf(await refresh(env, deps, secondTokens.refresh_token))).toBe("invalid_grant")
  })

  it("30 天没用就失效，并删掉这条连接", async () => {
    const env = oauthEnv()
    const tokens = await connect(env, testDeps())
    const late = await refresh(env, testDeps({ now: () => NOW + 30 * DAY }), tokens.refresh_token)
    expect(await errorOf(late)).toBe("invalid_grant")
    expect(env.DB.rows("SELECT id FROM oauth_grants")).toEqual([])
  })

  it("别的客户端、超出原来的范围、资源不同都不行", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const tokens = await connect(env, deps)
    expect(await errorOf(await refresh(env, deps, tokens.refresh_token, { client_id: "https://chatgpt.com/oauth/codex/client.json" })))
      .toBe("invalid_grant")
    expect(await errorOf(await refresh(env, deps, tokens.refresh_token, { scope: "mcp admin" }))).toBe("invalid_scope")
    expect(await errorOf(await refresh(env, deps, tokens.refresh_token, { resource: "https://other.test/mcp" }))).toBe("invalid_target")
    expect(await errorOf(await refresh(env, deps, "ddr_garbage"))).toBe("invalid_grant")
    // 上面都没动到这条连接
    expect((await refresh(env, deps, tokens.refresh_token, { scope: "mcp", resource: `${ORIGIN}/mcp` })).status).toBe(200)
  })

  it("续期时顺手删掉这条连接已过期的通行令牌", async () => {
    const env = oauthEnv()
    const tokens = await connect(env, testDeps())
    await refresh(env, testDeps({ now: () => NOW + 2 * HOUR }), tokens.refresh_token)
    const remaining = env.DB.rows<{ hash: string }>("SELECT hash FROM oauth_tokens")
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.hash).not.toBe(await sha256Hex(tokens.access_token))
  })
})
