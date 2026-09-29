import { describe, expect, it } from "vitest"
import { SESSION_MAX_AGE_SECONDS, issueSessionToken, verifySessionToken } from "./session"

const KEYS_A = { secret: "server-random-secret-a", password: "口令A" }
const KEYS_B = { secret: "server-random-secret-a", password: "口令B" }
const KEYS_OTHER_SECRET = { secret: "server-random-secret-b", password: "口令A" }

const NOW = 1_760_000_000_000
const TTL_MS = SESSION_MAX_AGE_SECONDS * 1000

function flipChar(token: string, index: number): string {
  const code = token.charCodeAt(index)
  const replacement = code === 97 ? "b" : "a"
  return token.slice(0, index) + replacement + token.slice(index + 1)
}

describe("issueSessionToken / verifySessionToken", () => {
  it("同一组 secret+password 签发的令牌校验通过", async () => {
    const token = await issueSessionToken(KEYS_A, NOW)
    expect(await verifySessionToken(KEYS_A, token, NOW)).toBe(true)
  })

  it("刚签发时通过，临过期 1 毫秒前仍通过", async () => {
    const token = await issueSessionToken(KEYS_A, NOW)
    expect(await verifySessionToken(KEYS_A, token, NOW + TTL_MS - 1)).toBe(true)
  })

  it("用不同口令校验失败", async () => {
    const token = await issueSessionToken(KEYS_A, NOW)
    expect(await verifySessionToken(KEYS_B, token, NOW)).toBe(false)
  })

  it("用不同 secret 校验失败", async () => {
    const token = await issueSessionToken(KEYS_A, NOW)
    expect(await verifySessionToken(KEYS_OTHER_SECRET, token, NOW)).toBe(false)
  })

  it("过期（TTL 之后）校验失败，过期的同一毫秒也失败", async () => {
    const token = await issueSessionToken(KEYS_A, NOW)
    expect(await verifySessionToken(KEYS_A, token, NOW + TTL_MS)).toBe(false)
    expect(await verifySessionToken(KEYS_A, token, NOW + TTL_MS + 60_000)).toBe(false)
  })

  it("改一个字符（口令区、时间区、签名区）校验失败", async () => {
    const token = await issueSessionToken(KEYS_A, NOW)
    // v1.<毫秒时间戳>.<base64url 签名>：时间戳和签名都各改一个字符
    const dot = token.indexOf(".")
    expect(await verifySessionToken(KEYS_A, flipChar(token, dot + 3), NOW)).toBe(false)
    expect(await verifySessionToken(KEYS_A, flipChar(token, token.length - 1), NOW)).toBe(false)
  })

  it("格式不对的令牌都失败", async () => {
    const token = await issueSessionToken(KEYS_A, NOW)
    const signature = token.slice(token.lastIndexOf(".") + 1)
    const cases = [
      "",
      "not-a-token",
      "v1.only-two-parts",
      "v2.123.signature", // 版本不对
      "v1.12x3.signature", // 过期时间不是纯数字
      `v1.1.2.3`, // 段数不对
      `v1.${NOW + TTL_MS}.!!!notbase64url`, // 签名段不是 base64url 字符
      `v1.${NOW + TTL_MS}.`, // 签名段为空
    ]
    for (const bad of cases) {
      expect(await verifySessionToken(KEYS_A, bad, NOW)).toBe(false)
    }
    // 合法格式作为对照
    expect(await verifySessionToken(KEYS_A, `v1.${NOW + TTL_MS}.${signature}`, NOW)).toBe(true)
  })
})
