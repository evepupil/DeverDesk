import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { pickLocale, readLocaleCookie } from "./locales"
import { redirectScript } from "./redirect-script"

type Page = { cookie?: string; cookieThrows?: boolean; search?: string; hash?: string }

/** 在一个假的浏览器环境里跑内联脚本，拿到它要跳去的地址 */
function run(languages: string[], { cookie = "", cookieThrows = false, search = "", hash = "" }: Page = {}): string {
  let target = ""
  runInNewContext(redirectScript(), {
    document: {
      get cookie() {
        if (cookieThrows) throw new Error("blocked")
        return cookie
      },
    },
    navigator: { languages, language: languages[0] ?? "" },
    location: { search, hash, replace: (url: string) => (target = url) },
    String,
  })
  return target
}

describe("根地址兜底跳转脚本", () => {
  const cases: Array<[string, string[]]> = [
    ["", ["zh-CN", "en"]],
    ["", ["en-US", "zh-TW"]],
    ["", ["ja-JP"]],
    ["", []],
    ["deverdesk-site-locale=en", ["zh-CN"]],
    ["a=1; deverdesk-site-locale=zh", ["en-US"]],
    ["deverdesk-site-locale=de", ["de-DE"]],
    ["x-deverdesk-site-locale=zh", ["en-US"]],
    ["deverdesk-site-locale=en; deverdesk-site-locale=zh", ["zh-CN"]],
  ]

  it("和服务端用的 pickLocale + readLocaleCookie 选的一致", () => {
    for (const [cookie, languages] of cases) {
      expect(run(languages, { cookie })).toBe(`/${pickLocale(readLocaleCookie(cookie), languages)}/`)
    }
  })

  it("带上查询参数和锚点；读不了 Cookie 时按浏览器语言选", () => {
    expect(run(["zh-CN"], { hash: "#features" })).toBe("/zh/#features")
    expect(run(["en-US"], { search: "?ref=hn", hash: "#faq" })).toBe("/en/?ref=hn#faq")
    expect(run(["zh-CN"], { cookie: "deverdesk-site-locale=en", cookieThrows: true })).toBe("/zh/")
  })
})
