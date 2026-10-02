import { describe, expect, it } from "vitest"
import { rateLimitSource } from "./rate-limit"

describe("限速的来源", () => {
  it("IPv4 按单个地址", () => {
    expect(rateLimitSource("203.0.113.7")).toBe("203.0.113.7")
    expect(rateLimitSource("unknown")).toBe("unknown")
  })

  it("IPv6 按前 64 位网段：同一网段里换地址算同一个来源", () => {
    expect(rateLimitSource("2001:db8:abcd:12::1")).toBe("2001:db8:abcd:12::/64")
    expect(rateLimitSource("2001:0DB8:ABCD:0012:ffff:1:2:3")).toBe("2001:db8:abcd:12::/64")
    expect(rateLimitSource("2001:db8::5")).toBe("2001:db8:0:0::/64")
    expect(rateLimitSource("::1")).toBe("0:0:0:0::/64")
    expect(rateLimitSource("2001:db8:abcd:13::1")).not.toBe(rateLimitSource("2001:db8:abcd:12::1"))
  })

  it("IPv4 映射成 IPv6 的写法按 IPv4 算；写法不对的原样小写", () => {
    expect(rateLimitSource("::ffff:198.51.100.4")).toBe("198.51.100.4")
    expect(rateLimitSource("1:2:3:4:5:6:7:8:9")).toBe("1:2:3:4:5:6:7:8:9")
    expect(rateLimitSource("1::2::3")).toBe("1::2::3")
    expect(rateLimitSource("ZZ::1")).toBe("zz::1")
  })
})
