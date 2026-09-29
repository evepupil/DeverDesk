import { beforeAll, describe, expect, it } from "vitest"
import { accessJwtKeyId, verifyAccessJwt, type AccessJsonWebKey } from "./jwt"

const NOW_SECONDS = 1_800_000_000
const ISSUER = "https://team.example.com"
const AUDIENCE = "deverdesk.example.com"
const KID = "test-key-1"

interface RSAKeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

let keys: AccessJsonWebKey[]
let privateKey: CryptoKey

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as RSAKeyPair
  privateKey = pair.privateKey
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey & { kid?: string }
  keys = [{ ...jwk, kid: KID }]
})

function base64UrlJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

async function signJwt(
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  signWith: CryptoKey = privateKey
): Promise<string> {
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signWith, new TextEncoder().encode(signingInput))
  const bytes = new Uint8Array(signature)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `${signingInput}.${btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    exp: NOW_SECONDS + 600,
    ...overrides,
  }
}

const validHeader = { alg: "RS256", kid: KID, typ: "JWT" }

describe("accessJwtKeyId", () => {
  it("能从头部读出 kid", async () => {
    const token = await signJwt(validHeader, validClaims())
    expect(accessJwtKeyId(token)).toBe(KID)
  })

  it("头部没有 kid 或令牌格式不对时返回 null", async () => {
    expect(accessJwtKeyId(await signJwt({ alg: "RS256" }, validClaims()))).toBeNull()
    expect(accessJwtKeyId("not-a-jwt")).toBeNull()
  })
})

describe("verifyAccessJwt", () => {
  it("iss、aud、exp 都对时通过", async () => {
    const token = await signJwt(validHeader, validClaims())
    expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(true)
  })

  it("aud 是数组且包含本应用时通过", async () => {
    const token = await signJwt(validHeader, validClaims({ aud: ["other-app", AUDIENCE] }))
    expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(true)
  })

  it("aud 不含本应用时失败", async () => {
    const token = await signJwt(validHeader, validClaims({ aud: ["other-app"] }))
    expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
  })

  it("iss 不对时失败", async () => {
    const token = await signJwt(validHeader, validClaims({ iss: "https://evil.example.com" }))
    expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
  })

  it("已过期时失败（exp 等于当前秒也算过期）", async () => {
    const expired = await signJwt(validHeader, validClaims({ exp: NOW_SECONDS }))
    expect(await verifyAccessJwt(expired, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
    const past = await signJwt(validHeader, validClaims({ exp: NOW_SECONDS - 10 }))
    expect(await verifyAccessJwt(past, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
  })

  it("签名被改时失败", async () => {
    const token = await signJwt(validHeader, validClaims())
    const tampered = `${token.slice(0, -2)}aa`
    expect(await verifyAccessJwt(tampered, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
  })

  it("载荷被改时失败（签名对不上）", async () => {
    const token = await signJwt(validHeader, validClaims())
    const [header, , signature] = token.split(".")
    const forgedPayload = base64UrlJson(validClaims({ exp: NOW_SECONDS + 99_999 }))
    expect(await verifyAccessJwt(`${header}.${forgedPayload}.${signature}`, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
  })

  it("alg 不是 RS256 时失败（包括用同一把密钥签的其他算法头）", async () => {
    const token = await signJwt({ ...validHeader, alg: "HS256" }, validClaims())
    expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
  })

  it("kid 找不到时失败", async () => {
    const token = await signJwt({ ...validHeader, kid: "unknown-kid" }, validClaims())
    expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
  })

  it("密钥列表里没有 RSA 密钥或列表为空时失败", async () => {
    const token = await signJwt(validHeader, validClaims())
    expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, [], NOW_SECONDS)).toBe(false)
  })

  describe("nbf 生效时间检查", () => {
    it("nbf 比现在晚 60 秒以内时通过", async () => {
      const token = await signJwt(validHeader, validClaims({ nbf: NOW_SECONDS + 60 }))
      expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(true)
      const justNow = await signJwt(validHeader, validClaims({ nbf: NOW_SECONDS - 1 }))
      expect(await verifyAccessJwt(justNow, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(true)
    })

    it("nbf 比现在晚 60 秒以上时失败", async () => {
      const token = await signJwt(validHeader, validClaims({ nbf: NOW_SECONDS + 61 }))
      expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
      const future = await signJwt(validHeader, validClaims({ nbf: NOW_SECONDS + 3600 }))
      expect(await verifyAccessJwt(future, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
    })

    it("nbf 不是数字时失败", async () => {
      const asString = await signJwt(validHeader, validClaims({ nbf: "1800000000" }))
      expect(await verifyAccessJwt(asString, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
      const asNull = await signJwt(validHeader, validClaims({ nbf: null }))
      expect(await verifyAccessJwt(asNull, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(false)
    })

    it("没有 nbf 时照常通过", async () => {
      const token = await signJwt(validHeader, validClaims())
      expect("nbf" in validClaims()).toBe(false)
      expect(await verifyAccessJwt(token, ISSUER, AUDIENCE, keys, NOW_SECONDS)).toBe(true)
    })
  })
})
