import { describe, expect, it } from "vitest"
import { isValidCodeChallenge, s256, verifyCodeVerifier } from "./pkce"
import { canonicalResource, grantedScope, isOwnResource, isScopeWithin } from "./scope"

describe("PKCE 只认 S256", () => {
  const verifier = "Kq3-x_9.~Zr1Lm8Np2Qs7Tu4Vw6Xy0Ab5Cd3Ef9Gh1Ij"

  it("和 Node 的 crypto.createHash('sha256') 算出来的一样", async () => {
    expect(await s256(verifier)).toBe("28qQrNkWksDKu-5QA8LjGBbFCf04fNuzLFn8LMMVRIk")
  })

  it("原文算出来和 challenge 一致才通过", async () => {
    const challenge = await s256(verifier)
    expect(await verifyCodeVerifier(verifier, challenge)).toBe(true)
    expect(await verifyCodeVerifier(`${verifier}x`, challenge)).toBe(false)
  })

  it("plain 降级过不了：拿原文当 challenge 也不行", async () => {
    const plain = "p".repeat(43)
    expect(await verifyCodeVerifier(plain, plain)).toBe(false)
  })

  it("原文太短、太长、带不允许的字符都不通过", async () => {
    for (const bad of ["short", "a".repeat(129), `${"a".repeat(42)} `, `${"a".repeat(42)}+`]) {
      expect(await verifyCodeVerifier(bad, await s256(bad))).toBe(false)
    }
  })

  it("challenge 必须是 43 位 base64url", async () => {
    expect(isValidCodeChallenge(await s256(verifier))).toBe(true)
    expect(isValidCodeChallenge(`${await s256(verifier)}=`)).toBe(false)
    expect(isValidCodeChallenge("x".repeat(64))).toBe(false)
    expect(isValidCodeChallenge("")).toBe(false)
  })
})

describe("范围和资源地址", () => {
  it("总是给 mcp，请求了 offline_access 再加上，不认识的忽略", () => {
    expect(grantedScope(null)).toBe("mcp")
    expect(grantedScope("openid profile")).toBe("mcp")
    expect(grantedScope("mcp offline_access")).toBe("mcp offline_access")
    expect(grantedScope("offline_access")).toBe("mcp offline_access")
  })

  it("续期时的范围不能超出原来的", () => {
    expect(isScopeWithin("mcp", "mcp offline_access")).toBe(true)
    expect(isScopeWithin("", "mcp")).toBe(true)
    expect(isScopeWithin("mcp admin", "mcp")).toBe(false)
  })

  it("资源地址统一写法：主机小写、去掉结尾斜杠", () => {
    expect(canonicalResource("https://Desk.Test/mcp/")).toBe("https://desk.test/mcp")
    expect(canonicalResource("https://desk.test/mcp?x=1")).toBeNull()
    expect(canonicalResource("https://desk.test/mcp#")).toBeNull()
    expect(canonicalResource("ftp://desk.test/mcp")).toBeNull()
    expect(canonicalResource("desk.test/mcp")).toBeNull()
  })

  it("没带 resource 算本站；带了必须是本站 /mcp", () => {
    expect(isOwnResource(null, "https://desk.test/mcp")).toBe(true)
    expect(isOwnResource("https://desk.test/mcp/", "https://desk.test/mcp")).toBe(true)
    expect(isOwnResource("https://desk.test", "https://desk.test/mcp")).toBe(false)
    expect(isOwnResource("https://other.test/mcp", "https://desk.test/mcp")).toBe(false)
  })
})
