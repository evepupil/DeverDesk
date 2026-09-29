// 下载并缓存 Cloudflare Access 公钥，kid 未命中时强制刷新 JWKS（有节流）。
import { accessJwtKeyId, verifyAccessJwt } from "./jwt"
import type { AccessJsonWebKey } from "./jwt"

interface CachedKeys {
  issuer: string
  keys: AccessJsonWebKey[]
  expiresAt: number
}

let cachedKeys: CachedKeys | null = null
let lastForcedRefreshAt = 0
const JWKS_CACHE_MS = 15 * 60 * 1000
/** kid 未命中时最多这么久强制刷新一次：换钥后最多晚一分钟认新钥，随便编的 kid 也不能让每个请求都去拉一次公钥 */
const FORCED_REFRESH_INTERVAL_MS = 60 * 1000

export function accessIssuer(teamDomain: string): string | null {
  const host = teamDomain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  if (!host || host.includes("/") || /\s/.test(host)) return null
  return `https://${host}`
}

async function loadKeys(issuer: string, force = false): Promise<AccessJsonWebKey[]> {
  if (!force && cachedKeys?.issuer === issuer && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { cf: { cacheTtl: 0, cacheEverything: false } })
  if (!response.ok) throw new Error("Access JWKS request failed")
  const payload = await response.json() as { keys?: unknown }
  if (!Array.isArray(payload.keys)) throw new Error("Access JWKS response is invalid")
  const keys = payload.keys.filter((key): key is AccessJsonWebKey => {
    if (typeof key !== "object" || key === null || Array.isArray(key)) return false
    const candidate = key as Record<string, unknown>
    return candidate.kty === "RSA" && typeof candidate.kid === "string"
  })
  cachedKeys = { issuer, keys, expiresAt: Date.now() + JWKS_CACHE_MS }
  return keys
}

export async function verifyAccessAssertion(token: string, teamDomain: string, audience: string): Promise<boolean> {
  const issuer = accessIssuer(teamDomain)
  const kid = accessJwtKeyId(token)
  if (!issuer || !kid) return false
  try {
    let keys = await loadKeys(issuer)
    const now = Date.now()
    if (!keys.some((key) => key.kid === kid) && now - lastForcedRefreshAt >= FORCED_REFRESH_INTERVAL_MS) {
      lastForcedRefreshAt = now
      keys = await loadKeys(issuer, true)
    }
    return await verifyAccessJwt(token, issuer, audience, keys)
  } catch {
    return false
  }
}
