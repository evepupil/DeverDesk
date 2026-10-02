// 授权来的令牌接到 /mcp、/api 和「连接 AI」列表上的整体行为。
import { describe, expect, it } from "vitest"
import { createToken } from "../db/tokens"
import { handleMcpRequest } from "../mcp"
import { dependencies, jsonRpcResponse, legacyRequest, resultOf } from "../mcp/test-support"
import { dispatchApi } from "../routes"
import type { TokenInfo } from "../../src/sync/protocol"
import { NOW, ORIGIN, authorizeQuery, connect, oauthEnv, testDeps, type TestEnv } from "./test-support"

const HOUR = 60 * 60 * 1000
const LIST = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }

function context(access = false): ExecutionContext {
  return { waitUntil() {}, passThroughOnException() {}, ...(access ? { access: true } : {}) } as unknown as ExecutionContext
}

function listRequest(token: string, url: string): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(LIST),
  })
}

async function toolNames(env: TestEnv, token: string, url = `${ORIGIN}/mcp`, now = NOW): Promise<string[] | number> {
  const response = await handleMcpRequest(listRequest(token, url), env, { ...dependencies, now: () => now })
  if (response.status !== 200) return response.status
  const tools = resultOf(await jsonRpcResponse(response)).tools as Array<{ name: string }>
  return tools.map((tool) => tool.name)
}

describe("/mcp 认授权来的通行令牌", () => {
  it("按连接的权限档给工具；身份是连接编号和应用名字", async () => {
    const env = oauthEnv()
    const read = await connect(env, testDeps(), "read")
    const propose = await connect(env, testDeps(), "propose")
    expect(await toolNames(env, read.access_token)).toEqual(["get_day"])
    expect(await toolNames(env, propose.access_token)).toEqual(["get_day", "add_tasks", "delete_records", "manage_changes"])

    const call = await handleMcpRequest(legacyRequest(read.access_token, {
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_day", arguments: {} },
    }), env, dependencies)
    const grantId = env.DB.rows<{ id: string }>("SELECT id FROM oauth_grants WHERE tier = 'read'")[0]!.id
    expect(resultOf(await jsonRpcResponse(call)).structuredContent).toMatchObject({
      token: { id: grantId, name: "ChatGPT", tier: "read" },
    })
    expect(env.DB.rows("SELECT last_used_at FROM oauth_grants WHERE id = ?", grantId)).toEqual([{ last_used_at: NOW }])
  })

  it("过期、发给别的地址、连接被断开都回 401，并指向资源说明书", async () => {
    const env = oauthEnv()
    const tokens = await connect(env, testDeps())
    expect(await toolNames(env, tokens.access_token, `${ORIGIN}/mcp`, NOW + HOUR)).toBe(401)
    expect(await toolNames(env, tokens.access_token, "https://other.test/mcp")).toBe(401)

    const response = await handleMcpRequest(listRequest(tokens.access_token, `${ORIGIN}/mcp`), env, {
      ...dependencies,
      now: () => NOW + HOUR,
    })
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer realm="DeverDesk", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="mcp", error="invalid_token"`,
    )

    const grantId = env.DB.rows<{ id: string }>("SELECT id FROM oauth_grants")[0]!.id
    const removed = await dispatchApi(new Request(`${ORIGIN}/api/tokens/${grantId}`, { method: "DELETE" }), env, context(true))
    expect(removed.status).toBe(204)
    expect(await toolNames(env, tokens.access_token)).toBe(401)
    expect(env.DB.rows("SELECT hash FROM oauth_tokens")).toEqual([])
  })

  it("在列表里改权限立即生效", async () => {
    const env = oauthEnv()
    const tokens = await connect(env, testDeps(), "read")
    const grantId = env.DB.rows<{ id: string }>("SELECT id FROM oauth_grants")[0]!.id
    const patched = await dispatchApi(new Request(`${ORIGIN}/api/tokens/${grantId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "write" }),
    }), env, context(true))
    expect(await patched.json()).toEqual({ id: grantId, tier: "write" })
    expect(await toolNames(env, tokens.access_token)).toEqual(["get_day", "add_tasks", "delete_records", "manage_changes"])
  })
})

describe("/api 和连接列表", () => {
  it("授权来的令牌只能用于 /mcp：调同步等接口当作没登录", async () => {
    const env = oauthEnv()
    const tokens = await connect(env, testDeps(), "write")
    for (const path of ["/api/sync?since=0&limit=10", "/api/summary", "/api/tokens"]) {
      const response = await dispatchApi(new Request(`${ORIGIN}${path}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }), { ...env, DEVERDESK_PASSWORD: "configured" }, context())
      expect(response.status).toBe(401)
    }
  })

  it("列表里个人令牌和授权连接放在一起，新的在前，授权连接带网站", async () => {
    const env = oauthEnv()
    await createToken(env.DB, "Claude Code", "write", NOW - HOUR)
    await connect(env, testDeps(), "propose")
    const response = await dispatchApi(new Request(`${ORIGIN}/api/tokens`), env, context(true))
    const list = await response.json() as TokenInfo[]
    expect(list.map(({ name, kind, host, tier }) => ({ name, kind, host, tier }))).toEqual([
      { name: "ChatGPT", kind: "oauth", host: "chatgpt.com", tier: "propose" },
      { name: "Claude Code", kind: "token", host: undefined, tier: "write" },
    ])
  })

  it("授权页背后的接口只认口令和 Access：个人令牌 403、没登录 401", async () => {
    const env = { ...oauthEnv(), DEVERDESK_PASSWORD: "configured" }
    const url = `${ORIGIN}/api/oauth/authorize?${await authorizeQuery()}`
    const personal = await createToken(env.DB, "Script", "write")
    const viaToken = await dispatchApi(new Request(url, { headers: { Authorization: `Bearer ${personal.token}` } }), env, context())
    expect(viaToken.status).toBe(403)
    const anonymous = await dispatchApi(new Request(url), env, context())
    expect(anonymous.status).toBe(401)
  })
})
