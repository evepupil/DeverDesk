import { describe, expect, it } from "vitest"
import { handleMcpRequest } from "./index"
import {
  installMcpTestHooks,
  legacyRequest,
  modernEnvelope,
  modernRequest,
  resultOf,
  send,
  testEnv,
  testTokens,
} from "./test-support"

installMcpTestHooks()

describe("MCP HTTP entry and protocol compatibility", () => {
  it("authenticates only Bearer tokens and distinguishes missing from invalid credentials", async () => {
    const missing = await handleMcpRequest(
      new Request("https://desk.test/mcp", { method: "POST" }), testEnv(),
    )
    expect(missing.status).toBe(401)
    expect(missing.headers.get("www-authenticate")).toBe('Bearer realm="DeverDesk"')
    expect(await missing.json()).toEqual({ error: "unauthorized" })

    const ignoredAuth = await handleMcpRequest(new Request("https://desk.test/mcp", {
      method: "POST",
      headers: { Cookie: "dd_session=ignored", "Cf-Access-Jwt-Assertion": "ignored" },
    }), testEnv())
    expect(ignoredAuth.status).toBe(401)
    expect(await ignoredAuth.json()).toEqual({ error: "unauthorized" })

    const invalid = await handleMcpRequest(
      legacyRequest(`dd_${"x".repeat(43)}`, { jsonrpc: "2.0" }), testEnv(),
    )
    expect(invalid.status).toBe(401)
    expect(invalid.headers.get("www-authenticate")).toContain('error="invalid_token"')
    expect(await invalid.json()).toEqual({ error: "invalid_token" })
  })

  it("rejects an Origin that differs from the exact request origin", async () => {
    const response = await handleMcpRequest(
      legacyRequest(testTokens().write, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, {
        headers: { Origin: "https://desk.test:444" },
      }),
      testEnv(),
    )
    expect(response.status).toBe(403)
    expect((await response.json() as { error: { code: number } }).error.code).toBe(-32000)
  })

  it("supports a legacy initialize handshake and tools/list", async () => {
    const initialize = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "mcp-test", version: "1.0.0" },
      },
    }))
    expect(initialize.response.status).toBe(200)
    expect(resultOf(initialize.body).protocolVersion).toBe("2025-11-25")

    const listed = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
    }))
    expect(listed.response.status).toBe(200)
    expect((resultOf(listed.body).tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual([
      "get_day", "add_tasks", "delete_records", "manage_changes",
    ])
  })

  it("supports modern envelope tools/list and tools/call requests", async () => {
    const listed = await send(modernRequest(testTokens().read, {
      jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: modernEnvelope() },
    }, "tools/list"))
    expect(listed.response.status).toBe(200)
    expect(listed.body.error).toBeUndefined()
    expect(resultOf(listed.body).resultType).toBe("complete")
    expect((resultOf(listed.body).tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual(["get_day"])

    const called = await send(modernRequest(testTokens().read, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "get_day", arguments: {}, _meta: modernEnvelope() },
    }, "tools/call"))
    expect(called.response.status).toBe(200)
    expect(called.body.error).toBeUndefined()
    expect(resultOf(called.body).structuredContent).toMatchObject({
      date: "2026-10-02", timeZone: "Asia/Shanghai", token: { tier: "read" },
    })
  })

  it("lets the SDK return 405 for authenticated GET and DELETE session methods", async () => {
    const get = await handleMcpRequest(legacyRequest(testTokens().write, {}, { method: "GET" }), testEnv())
    const remove = await handleMcpRequest(legacyRequest(testTokens().write, {}, { method: "DELETE" }), testEnv())
    expect(get.status).toBe(405)
    expect(remove.status).toBe(405)
  })
})
