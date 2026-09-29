// Cloudflare Access RS256 JWT 的独立解析和验签逻辑。
import { decodeBase64Url, utf8Encoder } from "./crypto"

interface JwtHeader {
  alg?: unknown
  kid?: unknown
}

interface JwtClaims {
  iss?: unknown
  aud?: unknown
  exp?: unknown
  nbf?: unknown
}

/** 生效时间允许的时钟误差（秒）：Access 和 Worker 的时钟可能差一两秒 */
const NOT_BEFORE_LEEWAY_SECONDS = 60

export interface AccessJsonWebKey extends JsonWebKey {
  kid: string
}

interface ParsedJwt {
  header: JwtHeader
  claims: JwtClaims
  signingInput: string
  signature: Uint8Array
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function decodeJsonPart(value: string): unknown {
  const bytes = decodeBase64Url(value)
  if (!bytes) throw new Error("invalid base64url")
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown
}

function parseJwt(token: string): ParsedJwt | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    const header = decodeJsonPart(parts[0])
    const claims = decodeJsonPart(parts[1])
    const signature = decodeBase64Url(parts[2])
    if (!isObject(header) || !isObject(claims) || !signature) return null
    return {
      header: header as JwtHeader,
      claims: claims as JwtClaims,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature,
    }
  } catch {
    return null
  }
}

export function accessJwtKeyId(token: string): string | null {
  const parsed = parseJwt(token)
  return typeof parsed?.header.kid === "string" ? parsed.header.kid : null
}

export async function verifyAccessJwt(
  token: string,
  issuer: string,
  audience: string,
  keys: AccessJsonWebKey[],
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  const parsed = parseJwt(token)
  if (!parsed || parsed.header.alg !== "RS256" || typeof parsed.header.kid !== "string") return false
  const { iss, aud, exp, nbf } = parsed.claims
  if (iss !== issuer || typeof exp !== "number" || !Number.isFinite(exp) || exp <= nowSeconds) return false
  if (nbf !== undefined && (typeof nbf !== "number" || !Number.isFinite(nbf) || nbf > nowSeconds + NOT_BEFORE_LEEWAY_SECONDS)) {
    return false
  }
  const audiences = typeof aud === "string" ? [aud] : Array.isArray(aud) && aud.every((item) => typeof item === "string") ? aud : []
  if (!audiences.includes(audience)) return false

  const jwk = keys.find((key) => key.kid === parsed.header.kid && key.kty === "RSA")
  if (!jwk) return false
  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    )
    return await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      parsed.signature,
      utf8Encoder.encode(parsed.signingInput)
    )
  } catch {
    return false
  }
}
