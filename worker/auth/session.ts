// 口令会话令牌的 HMAC-SHA256 签发与验证纯函数。
// 签名密钥由服务器端随机密钥和口令一起派生：没有随机密钥就算不出合法令牌，
// 猜口令只能走有失败限速的登录接口；改口令会让所有已登录的设备失效。
import { constantTimeEqual, decodeBase64Url, encodeBase64Url, utf8Encoder } from "./crypto"

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000

export interface SessionKeyMaterial {
  /** 只存在服务器端的随机密钥 */
  secret: string
  /** 部署时设的登录口令 */
  password: string
}

async function sessionKey({ secret, password }: SessionKeyMaterial): Promise<CryptoKey> {
  const seed = await crypto.subtle.digest("SHA-256", utf8Encoder.encode(`deverdesk-session:${secret}:${password}`))
  return crypto.subtle.importKey("raw", seed, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
}

export async function issueSessionToken(keys: SessionKeyMaterial, nowMs = Date.now()): Promise<string> {
  const payload = `v1.${Math.floor(nowMs + SESSION_TTL_MS)}`
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(keys), utf8Encoder.encode(payload))
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`
}

export async function verifySessionToken(keys: SessionKeyMaterial, token: string, nowMs = Date.now()): Promise<boolean> {
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false
  const expiresAt = Number(parts[1])
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowMs) return false
  const supplied = decodeBase64Url(parts[2])
  if (!supplied) return false
  const payload = `${parts[0]}.${parts[1]}`
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(keys), utf8Encoder.encode(payload)))
  return constantTimeEqual(expected, supplied)
}
