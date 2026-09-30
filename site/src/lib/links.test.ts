import { describe, expect, it } from "vitest"
import { externalRel, isDemo, isOwnRepo } from "./links"

describe("isOwnRepo", () => {
  it("仓库首页和仓库里的任意一页都算", () => {
    expect(isOwnRepo("https://github.com/evepupil/DeverDesk")).toBe(true)
    expect(isOwnRepo("https://github.com/evepupil/DeverDesk/commit/abc1234")).toBe(true)
    expect(isOwnRepo("https://github.com/evepupil/DeverDesk/blob/main/README.zh-CN.md#部署在线版")).toBe(true)
    expect(isOwnRepo("https://github.com/evepupil/deverdesk/issues/new")).toBe(true)
  })

  it("别的仓库、别的网站、名字只是开头相同的仓库、不是完整地址的都不算", () => {
    expect(isOwnRepo("https://github.com/evepupil")).toBe(false)
    expect(isOwnRepo("https://github.com/evepupil/DeverDesk-fork")).toBe(false)
    expect(isOwnRepo("https://github.com/vercel/next.js")).toBe(false)
    expect(isOwnRepo("https://deploy.workers.cloudflare.com/?url=https://github.com/evepupil/DeverDesk")).toBe(false)
    expect(isOwnRepo("/zh/")).toBe(false)
  })
})

describe("isDemo", () => {
  it("只认演示站自己的地址", () => {
    expect(isDemo("https://app.deverdesk.com")).toBe(true)
    expect(isDemo("https://app.deverdesk.com/week")).toBe(true)
    expect(isDemo("https://deverdesk.com/zh/")).toBe(false)
    expect(isDemo("http://app.deverdesk.com")).toBe(false)
    expect(isDemo("/zh/")).toBe(false)
  })
})

describe("externalRel", () => {
  it("去自家仓库和演示站的留下来源，其余不带来源", () => {
    expect(externalRel("https://github.com/evepupil/DeverDesk")).toBe("noopener")
    expect(externalRel("https://app.deverdesk.com")).toBe("noopener")
    expect(externalRel("https://nextjs.org")).toBe("noopener noreferrer")
  })
})
