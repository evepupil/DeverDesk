import { describe, expect, it } from "vitest"
import {
  appendQuery,
  isAcceptableRedirectUri,
  isLoopbackRedirectUri,
  matchesRegisteredRedirectUri,
  redirectUriHost,
} from "./redirect-uri"

describe("跳回地址合不合格", () => {
  it("收 https 和本机 http", () => {
    expect(isAcceptableRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true)
    expect(isAcceptableRedirectUri("https://claude.ai/api/mcp/auth_callback?x=1")).toBe(true)
    expect(isAcceptableRedirectUri("http://localhost:8787/callback")).toBe(true)
    expect(isAcceptableRedirectUri("http://127.0.0.1/callback")).toBe(true)
    expect(isAcceptableRedirectUri("http://[::1]:5000/cb")).toBe(true)
  })

  it("javascript:、data:、自定义协议、外网 http、带 # 和账号密码的一律不收", () => {
    expect(isAcceptableRedirectUri("javascript:alert(1)")).toBe(false)
    expect(isAcceptableRedirectUri("data:text/html,hi")).toBe(false)
    expect(isAcceptableRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(false)
    expect(isAcceptableRedirectUri("http://evil.example/callback")).toBe(false)
    expect(isAcceptableRedirectUri("http://localhost.evil.example/callback")).toBe(false)
    expect(isAcceptableRedirectUri("https://chatgpt.com/cb#frag")).toBe(false)
    expect(isAcceptableRedirectUri("https://user:pass@chatgpt.com/cb")).toBe(false)
    expect(isAcceptableRedirectUri("")).toBe(false)
    expect(isAcceptableRedirectUri(`https://a.example/${"x".repeat(520)}`)).toBe(false)
    expect(isAcceptableRedirectUri("not a url")).toBe(false)
  })

  it("认得出跳回本机的地址", () => {
    expect(isLoopbackRedirectUri("http://127.0.0.1:33418/")).toBe(true)
    expect(isLoopbackRedirectUri("https://vscode.dev/redirect")).toBe(false)
  })
})

describe("跳回地址对不对得上", () => {
  const registered = ["https://chatgpt.com/connector_platform_oauth_redirect", "http://127.0.0.1/callback", "http://127.0.0.1:33418/"]

  it("外网地址必须逐字相同", () => {
    expect(matchesRegisteredRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect", registered)).toBe(true)
    expect(matchesRegisteredRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect/", registered)).toBe(false)
    expect(matchesRegisteredRedirectUri("https://CHATGPT.com/connector_platform_oauth_redirect", registered)).toBe(false)
    expect(matchesRegisteredRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect?x=1", registered)).toBe(false)
  })

  it("本机地址可以换端口，主机、路径、查询串要一样", () => {
    expect(matchesRegisteredRedirectUri("http://127.0.0.1:51234/callback", registered)).toBe(true)
    expect(matchesRegisteredRedirectUri("http://127.0.0.1:40000/", registered)).toBe(true)
    expect(matchesRegisteredRedirectUri("http://localhost:51234/callback", registered)).toBe(false)
    expect(matchesRegisteredRedirectUri("http://127.0.0.1:51234/other", registered)).toBe(false)
    expect(matchesRegisteredRedirectUri("http://127.0.0.1:51234/callback?next=1", registered)).toBe(false)
  })

  it("不合格的请求地址不管登记了什么都对不上", () => {
    expect(matchesRegisteredRedirectUri("javascript:alert(1)", ["javascript:alert(1)"])).toBe(false)
  })
})

describe("显示用的网站和拼参数", () => {
  it("网站带非默认端口", () => {
    expect(redirectUriHost("https://chatgpt.com/cb")).toBe("chatgpt.com")
    expect(redirectUriHost("http://127.0.0.1:33418/")).toBe("127.0.0.1:33418")
  })

  it("接在已有查询串后面，空值不加", () => {
    expect(appendQuery("https://a.example/cb", { code: "c", state: null, iss: "https://desk.test" }))
      .toBe("https://a.example/cb?code=c&iss=https%3A%2F%2Fdesk.test")
    expect(appendQuery("https://a.example/cb?x=1", { code: "c" })).toBe("https://a.example/cb?x=1&code=c")
  })
})
