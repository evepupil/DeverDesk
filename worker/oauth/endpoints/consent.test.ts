import { describe, expect, it } from "vitest"
import { s256 } from "../rules/pkce"
import {
  CHATGPT_DOCUMENT,
  CHATGPT_ID,
  CHATGPT_REDIRECT,
  NOW,
  ORIGIN,
  VERIFIER,
  authorizeQuery,
  decide,
  fakeFetch,
  oauthEnv,
  testDeps,
} from "../test-support"
import { decideAuthorization, describeAuthorization } from "./consent"

async function describeQuery(query: string, deps = testDeps()) {
  const env = oauthEnv()
  const response = await describeAuthorization(new Request(`${ORIGIN}/api/oauth/authorize?${query}`), env, deps)
  return response.json() as Promise<Record<string, unknown>>
}

describe("授权页：检查授权请求", () => {
  it("读到 ChatGPT 的身份说明，给出名字和跳回的网站", async () => {
    expect(await describeQuery(await authorizeQuery())).toEqual({
      status: "ok",
      client: { name: "ChatGPT", host: "chatgpt.com", loopback: false },
    })
  })

  it("读不到 Claude 的身份说明时按内置名单认", async () => {
    const calls: string[] = []
    const query = await authorizeQuery({
      client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    })
    expect(await describeQuery(query, testDeps({ fetch: fakeFetch({}, calls) }))).toEqual({
      status: "ok",
      client: { name: "Claude", host: "claude.ai", loopback: false },
    })
    expect(calls).toEqual(["https://claude.ai/oauth/mcp-oauth-client-metadata"])
  })

  it("读得到时以线上为准：线上没列的跳回地址，内置名单里有也不认", async () => {
    const id = "https://claude.ai/oauth/mcp-oauth-client-metadata"
    const deps = testDeps({ fetch: fakeFetch({ [id]: { client_id: id, client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] } }) })
    const query = await authorizeQuery({ client_id: id, redirect_uri: "https://claude.com/api/mcp/auth_callback" })
    expect(await describeQuery(query, deps)).toEqual({ status: "invalid", reason: "redirect_uri" })
  })

  it("跳回本机的标出来，网站带端口", async () => {
    const id = "https://chatgpt.com/oauth/codex/client.json"
    const deps = testDeps({ fetch: fakeFetch({ [id]: { client_id: id, client_name: "Codex", token_endpoint_auth_method: "none", redirect_uris: ["http://127.0.0.1/callback"] } }) })
    const query = await authorizeQuery({ client_id: id, redirect_uri: "http://127.0.0.1:1455/callback" })
    expect(await describeQuery(query, deps)).toEqual({
      status: "ok",
      client: { name: "Codex", host: "127.0.0.1:1455", loopback: true },
    })
  })

  it("客户端或跳回地址有问题：链接无效，不跳转", async () => {
    expect(await describeQuery(await authorizeQuery({ client_id: null }))).toEqual({ status: "invalid", reason: "client_id" })
    expect(await describeQuery(await authorizeQuery({ client_id: "http://chatgpt.com/oauth/client.json" })))
      .toEqual({ status: "invalid", reason: "client_id" })
    expect(await describeQuery(await authorizeQuery({ client_id: "ddcl_missing" }))).toEqual({ status: "invalid", reason: "unknown_client" })
    expect(await describeQuery(await authorizeQuery({ client_id: "https://unknown.example/client.json" })))
      .toEqual({ status: "invalid", reason: "metadata_unavailable" })
    expect(await describeQuery(await authorizeQuery({ redirect_uri: "https://evil.example/cb" }))).toEqual({ status: "invalid", reason: "redirect_uri" })
    expect(await describeQuery(await authorizeQuery({ redirect_uri: null }))).toEqual({ status: "invalid", reason: "redirect_uri" })
    const duplicated = `${await authorizeQuery()}&client_id=${encodeURIComponent(CHATGPT_ID)}`
    expect(await describeQuery(duplicated)).toEqual({ status: "invalid", reason: "client_id" })
  })

  it("跳回地址对得上之后的问题：带着错误码、state 和 iss 跳回去", async () => {
    const cases: Array<[Record<string, string | null>, string]> = [
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ code_challenge: null }, "invalid_request"],
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge_method: null }, "invalid_request"],
      [{ code_challenge: "too-short" }, "invalid_request"],
      [{ resource: "https://other.test/mcp" }, "invalid_target"],
    ]
    for (const [overrides, error] of cases) {
      const body = await describeQuery(await authorizeQuery(overrides))
      expect(body.status).toBe("redirect")
      const target = new URL(body.redirectTo as string)
      expect(`${target.origin}${target.pathname}`).toBe(CHATGPT_REDIRECT)
      expect(target.searchParams.get("error")).toBe(error)
      expect(target.searchParams.get("state")).toBe("state-123")
      expect(target.searchParams.get("iss")).toBe(ORIGIN)
    }
  })

  it("没带 resource、带了结尾斜杠的都算本站", async () => {
    expect((await describeQuery(await authorizeQuery({ resource: null }))).status).toBe("ok")
    expect((await describeQuery(await authorizeQuery({ resource: `${ORIGIN}/mcp/` }))).status).toBe("ok")
  })
})

describe("授权页：允许和拒绝", () => {
  it("允许：发授权码，跳回带 code、state、iss；库里只存摘要和选的权限", async () => {
    const env = oauthEnv()
    const response = await decide(env, testDeps(), await authorizeQuery(), { tier: "write" })
    const body = await response.json() as { status: string; redirectTo: string }
    expect(body.status).toBe("redirect")
    const target = new URL(body.redirectTo)
    const code = target.searchParams.get("code")!
    expect(code).toMatch(/^ddc_[A-Za-z0-9_-]{43}$/)
    expect(target.searchParams.get("state")).toBe("state-123")
    expect(target.searchParams.get("iss")).toBe(ORIGIN)
    const rows = env.DB.rows<Record<string, unknown>>("SELECT * FROM oauth_codes")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      client_id: CHATGPT_ID,
      client_name: "ChatGPT",
      client_host: "chatgpt.com",
      redirect_uri: CHATGPT_REDIRECT,
      code_challenge: await s256(VERIFIER),
      resource: `${ORIGIN}/mcp`,
      scope: "mcp",
      tier: "write",
      expires_at: NOW + 5 * 60 * 1000,
      grant_id: null,
    })
    expect(JSON.stringify(rows)).not.toContain(code)
  })

  it("拒绝：带 access_denied 跳回，不发授权码", async () => {
    const env = oauthEnv()
    const response = await decide(env, testDeps(), await authorizeQuery(), { decision: "deny" })
    const body = await response.json() as { redirectTo: string }
    const target = new URL(body.redirectTo)
    expect(target.searchParams.get("error")).toBe("access_denied")
    expect(target.searchParams.get("state")).toBe("state-123")
    expect(target.searchParams.get("code")).toBeNull()
    expect(env.DB.rows("SELECT * FROM oauth_codes")).toEqual([])
  })

  it("允许时整份再检查一遍：链接无效就不发授权码", async () => {
    const env = oauthEnv()
    const response = await decide(env, testDeps(), await authorizeQuery({ redirect_uri: "https://evil.example/cb" }))
    expect(await response.json()).toEqual({ status: "invalid", reason: "redirect_uri" })
    expect(env.DB.rows("SELECT * FROM oauth_codes")).toEqual([])
  })

  it("只收本站页面发来的 JSON：别的来源、没带来源、不是 JSON 都拒绝", async () => {
    const env = oauthEnv()
    const query = await authorizeQuery()
    expect((await decide(env, testDeps(), query, { origin: "https://evil.example" })).status).toBe(403)
    expect((await decide(env, testDeps(), query, { origin: null })).status).toBe(403)
    const form = await decideAuthorization(new Request(`${ORIGIN}/api/oauth/authorize`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "text/plain" },
      body: JSON.stringify({ query, decision: "allow", tier: "write" }),
    }), env, testDeps())
    expect(form.status).toBe(415)
    expect(env.DB.rows("SELECT * FROM oauth_codes")).toEqual([])
  })

  it("请求体内容不对回 400", async () => {
    const env = oauthEnv()
    for (const body of [{}, { query: "x", decision: "maybe", tier: "write" }, { query: "x", decision: "allow", tier: "admin" }]) {
      const response = await decideAuthorization(new Request(`${ORIGIN}/api/oauth/authorize`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }), env, testDeps())
      expect(response.status).toBe(400)
    }
  })

  it("授权码里记下 offline_access", async () => {
    const env = oauthEnv()
    await decide(env, testDeps({ fetch: fakeFetch({ [CHATGPT_ID]: CHATGPT_DOCUMENT }) }), await authorizeQuery({ scope: "mcp offline_access" }))
    expect(env.DB.rows<{ scope: string }>("SELECT scope FROM oauth_codes")).toEqual([{ scope: "mcp offline_access" }])
  })
})
