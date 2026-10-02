// PKCE（防授权码被半路截走的校验）：只认 S256。
import { constantTimeEqual, encodeBase64Url, utf8Encoder } from "../../auth/crypto"

/** S256 的 code_challenge 是 SHA-256 摘要的 base64url，恰好 43 个字符 */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/
/** code_verifier：43–128 个「不需要转义」的字符（RFC 7636） */
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/

export function isValidCodeChallenge(value: string): boolean {
  return CHALLENGE.test(value)
}

export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8Encoder.encode(verifier))
  return encodeBase64Url(new Uint8Array(digest))
}

/** 换令牌时带来的原文算出来要和授权时的 code_challenge 一致 */
export async function verifyCodeVerifier(verifier: string, challenge: string): Promise<boolean> {
  if (!VERIFIER.test(verifier) || !isValidCodeChallenge(challenge)) return false
  const computed = await s256(verifier)
  return constantTimeEqual(utf8Encoder.encode(computed), utf8Encoder.encode(challenge))
}
