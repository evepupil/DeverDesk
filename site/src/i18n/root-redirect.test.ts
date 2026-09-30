import { describe, expect, it } from "vitest"
import { rootRedirect } from "./root-redirect"

function request(path: string, headers: Record<string, string> = {}, method = "GET"): Request {
  return new Request(`https://deverdesk.com${path}`, { method, headers })
}

describe("rootRedirect", () => {
  it("浏览器语言有中文跳 /zh/，其余跳 /en/", () => {
    expect(rootRedirect(request("/", { "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" }))?.headers.get("Location")).toBe("https://deverdesk.com/zh/")
    expect(rootRedirect(request("/", { "Accept-Language": "en-US,zh-TW;q=0.5" }))?.headers.get("Location")).toBe("https://deverdesk.com/zh/")
    expect(rootRedirect(request("/", { "Accept-Language": "ja-JP" }))?.headers.get("Location")).toBe("https://deverdesk.com/en/")
    // 爬虫一般不带语言
    expect(rootRedirect(request("/"))?.headers.get("Location")).toBe("https://deverdesk.com/en/")
  })

  it("Cookie 里记过的语言优先", () => {
    const response = rootRedirect(request("/", { "Accept-Language": "en-US", Cookie: "a=1; deverdesk-site-locale=zh" }))
    expect(response?.headers.get("Location")).toBe("https://deverdesk.com/zh/")
  })

  it("302 跳转，带上查询参数，不许缓存", () => {
    const response = rootRedirect(request("/?ref=hn&utm_source=x", { "Accept-Language": "en" }))
    expect(response?.status).toBe(302)
    expect(response?.headers.get("Location")).toBe("https://deverdesk.com/en/?ref=hn&utm_source=x")
    expect(response?.headers.get("Cache-Control")).toBe("no-store")
    expect(response?.headers.get("Vary")).toBe("Accept-Language, Cookie")
  })

  it("HEAD 也跳；别的地址、别的请求方法不管", () => {
    expect(rootRedirect(request("/", {}, "HEAD"))?.status).toBe(302)
    expect(rootRedirect(request("/zh/"))).toBeNull()
    expect(rootRedirect(request("/index.html"))).toBeNull()
    expect(rootRedirect(request("/", {}, "POST"))).toBeNull()
  })
})
