import { describe, expect, it } from "vitest"
import { isLocale, localePath, pickLocale, swapLocale } from "./locales"

describe("pickLocale", () => {
  it("存过的语言优先", () => {
    expect(pickLocale("en", ["zh-CN"])).toBe("en")
    expect(pickLocale("zh", ["en-US"])).toBe("zh")
  })

  it("没存过时，浏览器语言里有 zh 开头的就用中文", () => {
    expect(pickLocale(null, ["zh-CN", "en"])).toBe("zh")
    expect(pickLocale(undefined, ["en-US", "zh-TW"])).toBe("zh")
    expect(pickLocale(null, ["ZH-hk"])).toBe("zh")
  })

  it("其余一律英文，存的值不认识也当没存过", () => {
    expect(pickLocale(null, ["ja-JP", "fr"])).toBe("en")
    expect(pickLocale("de", ["de-DE"])).toBe("en")
    expect(pickLocale(null, [])).toBe("en")
  })
})

describe("localePath", () => {
  it("首页和子页都带结尾斜杠", () => {
    expect(localePath("zh")).toBe("/zh/")
    expect(localePath("en", "/blog/")).toBe("/en/blog/")
    expect(localePath("en", "blog")).toBe("/en/blog/")
    expect(localePath("zh", "/blog/hourly-rate")).toBe("/zh/blog/hourly-rate/")
  })

  it("保留锚点", () => {
    expect(localePath("zh", "/#features")).toBe("/zh/#features")
    expect(localePath("en", "/#open-source")).toBe("/en/#open-source")
  })
})

describe("swapLocale", () => {
  it("换掉地址里的语言段", () => {
    expect(swapLocale("/zh/", "en")).toBe("/en/")
    expect(swapLocale("/zh/blog/hourly-rate/", "en")).toBe("/en/blog/hourly-rate/")
    expect(swapLocale("/en/changelog", "zh")).toBe("/zh/changelog/")
  })

  it("没有语言段时给目标语言首页", () => {
    expect(swapLocale("/", "zh")).toBe("/zh/")
    expect(swapLocale("/foo/", "en")).toBe("/en/")
  })
})

describe("isLocale", () => {
  it("只认 zh 和 en", () => {
    expect(isLocale("zh")).toBe(true)
    expect(isLocale("en")).toBe(true)
    expect(isLocale("zh-CN")).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
