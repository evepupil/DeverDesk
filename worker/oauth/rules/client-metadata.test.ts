import { describe, expect, it } from "vitest"
import { displayName, isClientMetadataUrl, parseClientMetadata } from "./client-metadata"
import { checkRegistration } from "./registration"

describe("身份说明的编号", () => {
  it("收各家真实的编号", () => {
    expect(isClientMetadataUrl("https://chatgpt.com/oauth/client.json")).toBe(true)
    expect(isClientMetadataUrl("https://claude.ai/oauth/mcp-oauth-client-metadata")).toBe(true)
    expect(isClientMetadataUrl("https://vscode.dev/oauth/client-metadata.json")).toBe(true)
  })

  it("不是标准写法、没有路径、指向本机或 IP 的不收", () => {
    expect(isClientMetadataUrl("http://chatgpt.com/oauth/client.json")).toBe(false)
    expect(isClientMetadataUrl("https://chatgpt.com/")).toBe(false)
    expect(isClientMetadataUrl("https://chatgpt.com")).toBe(false)
    expect(isClientMetadataUrl("https://chatgpt.com/a/../client.json")).toBe(false)
    expect(isClientMetadataUrl("https://chatgpt.com/./client.json")).toBe(false)
    expect(isClientMetadataUrl("https://ChatGPT.com/oauth/client.json")).toBe(false)
    expect(isClientMetadataUrl("https://chatgpt.com:443/oauth/client.json")).toBe(false)
    expect(isClientMetadataUrl("https://user@chatgpt.com/oauth/client.json")).toBe(false)
    expect(isClientMetadataUrl("https://chatgpt.com/oauth/client.json#x")).toBe(false)
    expect(isClientMetadataUrl("https://localhost/client.json")).toBe(false)
    expect(isClientMetadataUrl("https://127.0.0.1/client.json")).toBe(false)
    expect(isClientMetadataUrl("https://[::1]/client.json")).toBe(false)
    expect(isClientMetadataUrl("https://intranet/client.json")).toBe(false)
    expect(isClientMetadataUrl("https://app.localhost/client.json")).toBe(false)
  })
})

describe("身份说明的内容", () => {
  const url = "https://chatgpt.com/oauth/client.json"
  // 2026-10-02 本机读到的 ChatGPT 身份说明
  const chatgpt = {
    client_id: url,
    client_uri: "https://chatgpt.com/",
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: "ChatGPT",
    jwks_uri: "https://chatgpt.com/oauth/jwks.json",
  }

  it("ChatGPT 声明 private_key_jwt、同时支持 none，按公开客户端认", () => {
    expect(parseClientMetadata(url, chatgpt)).toEqual({
      clientId: url,
      name: "ChatGPT",
      redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    })
  })

  it("编号和网址不一致、带密钥、只能用签名认证、跳回地址不合格的不认", () => {
    expect(parseClientMetadata(url, { ...chatgpt, client_id: "https://evil.example/client.json" })).toBeNull()
    expect(parseClientMetadata(url, { ...chatgpt, client_secret: "s" })).toBeNull()
    expect(parseClientMetadata(url, { ...chatgpt, token_endpoint_auth_methods_supported: ["private_key_jwt"] })).toBeNull()
    expect(parseClientMetadata(url, { ...chatgpt, redirect_uris: ["javascript:alert(1)"] })).toBeNull()
    expect(parseClientMetadata(url, { ...chatgpt, redirect_uris: [] })).toBeNull()
    expect(parseClientMetadata(url, { ...chatgpt, redirect_uris: "https://chatgpt.com/cb" })).toBeNull()
    expect(parseClientMetadata(url, [chatgpt])).toBeNull()
    expect(parseClientMetadata(url, null)).toBeNull()
  })

  it("没写名字用域名；名字去掉控制字符、截到 100 字", () => {
    const nameless = Object.fromEntries(Object.entries(chatgpt).filter(([key]) => key !== "client_name"))
    expect(parseClientMetadata(url, nameless)?.name).toBe("chatgpt.com")
    expect(displayName("  Chat\u0007GPT\n ", "x.example")).toBe("ChatGPT")
    // 从右往左排、零宽空格、下一行、行分隔符都会把标题搅乱
    expect(displayName("Chat‮GPT​\u0085 ", "x.example")).toBe("ChatGPT")
    expect(displayName("名".repeat(150), "x.example")).toHaveLength(100)
    expect(displayName("   ", "x.example")).toBe("x.example")
  })
})

describe("自助登记的内容", () => {
  it("没写认证方式按公开客户端，名字缺省用跳回地址的网站", () => {
    expect(checkRegistration({ redirect_uris: ["http://localhost:8787/callback"] })).toEqual({
      ok: true,
      value: {
        name: "localhost:8787",
        redirectUris: ["http://localhost:8787/callback"],
        authMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
      },
    })
  })

  it("带密钥的认证方式、去重的跳回地址、只保留认识的授权方式", () => {
    const checked = checkRegistration({
      client_name: "Cursor",
      redirect_uris: ["https://www.cursor.com/agents/mcp/oauth/callback", "https://www.cursor.com/agents/mcp/oauth/callback"],
      token_endpoint_auth_method: "client_secret_post",
      grant_types: ["authorization_code", "implicit"],
      response_types: ["code"],
    })
    expect(checked).toEqual({
      ok: true,
      value: {
        name: "Cursor",
        redirectUris: ["https://www.cursor.com/agents/mcp/oauth/callback"],
        authMethod: "client_secret_post",
        grantTypes: ["authorization_code"],
      },
    })
  })

  it("Cursor 同时报 cursor:// 地址：去掉它，其余照常登记", () => {
    // Cursor 3.10 以后的登记内容（论坛报告），授权时用的是本机地址
    const checked = checkRegistration({
      client_name: "Cursor",
      redirect_uris: [
        "cursor://anysphere.cursor-mcp/oauth/callback",
        "https://www.cursor.com/agents/mcp/oauth/callback",
        "http://localhost:8787/callback",
      ],
    })
    expect(checked).toMatchObject({
      ok: true,
      value: { redirectUris: ["https://www.cursor.com/agents/mcp/oauth/callback", "http://localhost:8787/callback"] },
    })
  })

  it("跳回地址缺失或一个合格的都没有报 invalid_redirect_uri，其余问题报 invalid_client_metadata", () => {
    expect(checkRegistration({})).toMatchObject({ ok: false, error: "invalid_redirect_uri" })
    expect(checkRegistration({ redirect_uris: ["cursor://callback"] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" })
    expect(checkRegistration({ redirect_uris: Array.from({ length: 11 }, (_, i) => `https://a.example/${i}`) }))
      .toMatchObject({ ok: false, error: "invalid_redirect_uri" })
    expect(checkRegistration({ redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "private_key_jwt" }))
      .toMatchObject({ ok: false, error: "invalid_client_metadata" })
    expect(checkRegistration({ redirect_uris: ["https://a.example/cb"], grant_types: ["client_credentials"] }))
      .toMatchObject({ ok: false, error: "invalid_client_metadata" })
    expect(checkRegistration({ redirect_uris: ["https://a.example/cb"], response_types: ["token"] }))
      .toMatchObject({ ok: false, error: "invalid_client_metadata" })
  })
})
