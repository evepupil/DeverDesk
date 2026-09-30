import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { pickLocale } from "./locales"
import { redirectScript } from "./redirect-script"

/** 在一个假的浏览器环境里跑内联脚本，拿到它要跳去的地址 */
function run(stored: string | null, languages: string[], hash = "", storageThrows = false): string {
  let target = ""
  runInNewContext(redirectScript(), {
    localStorage: {
      getItem: () => {
        if (storageThrows) throw new Error("blocked")
        return stored
      },
    },
    navigator: { languages, language: languages[0] ?? "" },
    location: { hash, replace: (url: string) => (target = url) },
    String,
  })
  return target
}

describe("根地址跳转脚本", () => {
  const cases: Array<[string | null, string[]]> = [
    [null, ["zh-CN", "en"]],
    [null, ["en-US", "zh-TW"]],
    [null, ["ja-JP"]],
    [null, []],
    ["en", ["zh-CN"]],
    ["zh", ["en-US"]],
    ["de", ["de-DE"]],
  ]

  it("和 pickLocale 选的一致", () => {
    for (const [stored, languages] of cases) {
      expect(run(stored, languages)).toBe(`/${pickLocale(stored, languages)}/`)
    }
  })

  it("保留锚点；读不了浏览器存储时按浏览器语言选", () => {
    expect(run(null, ["zh-CN"], "#features")).toBe("/zh/#features")
    expect(run(null, ["zh-CN"], "", true)).toBe("/zh/")
  })
})
