import { describe, expect, it } from "vitest"
import { s256 } from "../rules/pkce"
import { handleOAuthRequest } from "../index"
import {
  NOW,
  ORIGIN,
  VERIFIER,
  authorizeQuery,
  connect,
  approveAndGetCode,
  oauthEnv,
  postForm,
  refresh,
  testDeps,
  type TestEnv,
  type TokenSet,
} from "../test-support"
import type { OAuthDependencies } from "../clients/types"
import { REGISTER_LIMIT_PER_WINDOW } from "./register"

function register(env: TestEnv, deps: OAuthDependencies, metadata: unknown, ip = "203.0.113.7"): Promise<Response | null> {
  return handleOAuthRequest(new Request(`${ORIGIN}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(metadata),
  }), env, deps)
}

async function json(response: Response | null): Promise<Record<string, unknown>> {
  if (!response) throw new Error("not routed")
  return response.json() as Promise<Record<string, unknown>>
}

const CURSOR = { client_name: "Cursor", redirect_uris: ["http://localhost:8787/callback"] }

describe("自助登记", () => {
  it("公开客户端：拿到 ddcl_ 编号，不发密钥", async () => {
    const env = oauthEnv()
    const response = await register(env, testDeps(), CURSOR)
    expect(response!.status).toBe(201)
    const body = await json(response)
    expect(body).toMatchObject({
      client_name: "Cursor",
      redirect_uris: ["http://localhost:8787/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(NOW / 1000),
    })
    expect(body.client_id).toMatch(/^ddcl_/)
    expect(body.client_secret).toBeUndefined()
  })

  it("登记过的客户端走完整授权：本机跳回地址换了端口也行", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const { client_id: clientId } = await json(await register(env, deps, CURSOR)) as { client_id: string }
    const redirectUri = "http://localhost:51234/callback"
    const code = await approveAndGetCode(env, deps, await authorizeQuery({ client_id: clientId, redirect_uri: redirectUri }))
    const response = await postForm(env, deps, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: VERIFIER,
    })
    expect(response!.status).toBe(200)
    expect(env.DB.rows("SELECT client_name, client_host FROM oauth_grants")).toEqual([
      { client_name: "Cursor", client_host: "localhost:51234" },
    ])
    expect(env.DB.rows<{ last_used_at: number }>("SELECT last_used_at FROM oauth_clients")).toEqual([{ last_used_at: NOW }])
  })

  it("带密钥的客户端：Basic 头和表单两种都认，密钥不对 401", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const registered = await json(await register(env, deps, { ...CURSOR, token_endpoint_auth_method: "client_secret_basic" })) as {
      client_id: string
      client_secret: string
    }
    expect(registered.client_secret).toMatch(/^ddcs_/)
    expect(env.DB.rows<{ secret_hash: string }>("SELECT secret_hash FROM oauth_clients")[0]!.secret_hash).not.toContain("ddcs_")

    const basic = (id: string, secret: string) => `Basic ${btoa(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`)}`
    const query = await authorizeQuery({ client_id: registered.client_id, redirect_uri: CURSOR.redirect_uris[0]! })
    const form = (code: string) => ({
      grant_type: "authorization_code",
      code,
      redirect_uri: CURSOR.redirect_uris[0]!,
      code_verifier: VERIFIER,
    })

    const wrong = await postForm(env, deps, "/oauth/token", form(await approveAndGetCode(env, deps, query)), {
      Authorization: basic(registered.client_id, "ddcs_wrong"),
    })
    expect(wrong!.status).toBe(401)
    expect(wrong!.headers.get("www-authenticate")).toBe('Basic realm="DeverDesk"')

    const missing = await postForm(env, deps, "/oauth/token", { ...form(await approveAndGetCode(env, deps, query)), client_id: registered.client_id })
    expect(missing!.status).toBe(401)

    const viaBasic = await postForm(env, deps, "/oauth/token", form(await approveAndGetCode(env, deps, query)), {
      Authorization: basic(registered.client_id, registered.client_secret),
    })
    expect(viaBasic!.status).toBe(200)

    const viaPost = await postForm(env, deps, "/oauth/token", {
      ...form(await approveAndGetCode(env, deps, query)),
      client_id: registered.client_id,
      client_secret: registered.client_secret,
    })
    expect(viaPost!.status).toBe(200)

    const both = await postForm(env, deps, "/oauth/token", {
      ...form(await approveAndGetCode(env, deps, query)),
      client_secret: registered.client_secret,
    }, { Authorization: basic(registered.client_id, registered.client_secret) })
    expect(both!.status).toBe(400)
  })

  it("内容不合格报对应的错误码", async () => {
    const env = oauthEnv()
    expect(await json(await register(env, testDeps(), { redirect_uris: ["cursor://callback"] }))).toMatchObject({ error: "invalid_redirect_uri" })
    expect(await json(await register(env, testDeps(), [CURSOR]))).toMatchObject({ error: "invalid_client_metadata" })
    expect(env.DB.rows("SELECT id FROM oauth_clients")).toEqual([])
  })

  it("同一 IP 一小时最多 20 次，过了窗口重新计", async () => {
    const env = oauthEnv()
    for (let index = 0; index < REGISTER_LIMIT_PER_WINDOW; index += 1) {
      expect((await register(env, testDeps(), CURSOR))!.status).toBe(201)
    }
    const blocked = await register(env, testDeps(), CURSOR)
    expect(blocked!.status).toBe(429)
    expect(blocked!.headers.get("retry-after")).toBe("3600")
    expect((await register(env, testDeps(), CURSOR, "198.51.100.1"))!.status).toBe(201)
    expect((await register(env, testDeps({ now: () => NOW + 60 * 60 * 1000 + 1 }), CURSOR))!.status).toBe(201)
  })

  it("超过一天没授权过的客户端在下次登记时被清掉，有连接的留着", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const unused = await json(await register(env, deps, CURSOR)) as { client_id: string }
    const used = await json(await register(env, deps, CURSOR)) as { client_id: string }
    const code = await approveAndGetCode(env, deps, await authorizeQuery({ client_id: used.client_id, redirect_uri: CURSOR.redirect_uris[0]! }))
    await postForm(env, deps, "/oauth/token", {
      grant_type: "authorization_code", code, redirect_uri: CURSOR.redirect_uris[0]!, client_id: used.client_id, code_verifier: VERIFIER,
    })
    await register(env, testDeps({ now: () => NOW + 2 * 24 * 60 * 60 * 1000 }), CURSOR, "198.51.100.2")
    const ids = env.DB.rows<{ id: string }>("SELECT id FROM oauth_clients").map((row) => row.id)
    expect(ids).not.toContain(unused.client_id)
    expect(ids).toContain(used.client_id)
  })
})

describe("注销", () => {
  it("续期令牌：整条连接断开；通行令牌：只作废这一张；找不到也回 200", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const first = await connect(env, deps)
    const revokeAccess = await postForm(env, deps, "/oauth/revoke", {
      token: first.access_token,
      client_id: "https://chatgpt.com/oauth/client.json",
    })
    expect(revokeAccess!.status).toBe(200)
    expect(env.DB.rows("SELECT hash FROM oauth_tokens")).toEqual([])
    expect(env.DB.rows("SELECT id FROM oauth_grants")).toHaveLength(1)

    const revokeRefresh = await postForm(env, deps, "/oauth/revoke", {
      token: first.refresh_token,
      client_id: "https://chatgpt.com/oauth/client.json",
    })
    expect(revokeRefresh!.status).toBe(200)
    expect(env.DB.rows("SELECT id FROM oauth_grants")).toEqual([])
    expect((await refresh(env, deps, first.refresh_token)).status).toBe(400)

    const unknown = await postForm(env, deps, "/oauth/revoke", { token: "whatever", client_id: "https://chatgpt.com/oauth/client.json" })
    expect(unknown!.status).toBe(200)
  })

  it("别的客户端注销不了这条连接", async () => {
    const env = oauthEnv()
    const deps = testDeps()
    const tokens: TokenSet = await connect(env, deps)
    await postForm(env, deps, "/oauth/revoke", { token: tokens.refresh_token, client_id: "https://chatgpt.com/oauth/codex/client.json" })
    expect(env.DB.rows("SELECT id FROM oauth_grants")).toHaveLength(1)
  })
})

describe("说明书和授权页", () => {
  it("资源说明书在带路径和根路径两处，内容一样", async () => {
    const env = oauthEnv()
    for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
      const response = await handleOAuthRequest(new Request(`${ORIGIN}${path}`), env, testDeps())
      expect(response!.status).toBe(200)
      expect(response!.headers.get("access-control-allow-origin")).toBe("*")
      expect(await response!.json()).toEqual({
        resource: `${ORIGIN}/mcp`,
        authorization_servers: [ORIGIN],
        scopes_supported: ["mcp"],
        bearer_methods_supported: ["header"],
        resource_name: "DeverDesk",
      })
    }
  })

  it("授权方说明书：S256、身份说明、iss、公开客户端都写上", async () => {
    const env = oauthEnv()
    const response = await handleOAuthRequest(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`), env, testDeps())
    expect(await response!.json()).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      revocation_endpoint: `${ORIGIN}/oauth/revoke`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: expect.arrayContaining(["none"]),
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ["mcp", "offline_access"],
    })
    const post = await handleOAuthRequest(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`, { method: "POST" }), env, testDeps())
    expect(post!.status).toBe(405)
  })

  it("开发时按 PUBLIC_ORIGIN 写地址", async () => {
    const env = { ...oauthEnv(), PUBLIC_ORIGIN: "http://localhost:3000/" }
    const response = await handleOAuthRequest(new Request("http://127.0.0.1:8787/.well-known/oauth-authorization-server"), env, testDeps())
    expect(await response!.json()).toMatchObject({ issuer: "http://localhost:3000", authorization_endpoint: "http://localhost:3000/authorize" })
  })

  it("授权页加上防嵌入、不缓存、不外传地址的响应头", async () => {
    const env = oauthEnv()
    const response = await handleOAuthRequest(new Request(`${ORIGIN}/authorize?client_id=x`), env, testDeps())
    expect(response!.status).toBe(200)
    expect(await response!.text()).toContain("authorize")
    expect(response!.headers.get("content-security-policy")).toBe("frame-ancestors 'none'")
    expect(response!.headers.get("x-frame-options")).toBe("DENY")
    expect(response!.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response!.headers.get("cache-control")).toBe("no-store")
  })

  it("别的 /.well-known 路径交回静态资源，/oauth 下没有的地址 404", async () => {
    const env = oauthEnv()
    expect(await handleOAuthRequest(new Request(`${ORIGIN}/.well-known/security.txt`), env, testDeps())).toBeNull()
    expect(await handleOAuthRequest(new Request(`${ORIGIN}/api/session`), env, testDeps())).toBeNull()
    expect((await handleOAuthRequest(new Request(`${ORIGIN}/oauth/nope`), env, testDeps()))!.status).toBe(404)
  })

  it("code_challenge 用的是 S256", async () => {
    expect(new URLSearchParams(await authorizeQuery()).get("code_challenge")).toBe(await s256(VERIFIER))
  })
})
