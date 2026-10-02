// 换令牌和注销时认客户端：Authorization: Basic 头、表单里的 client_secret，或者公开客户端只带 client_id。
import { constantTimeEqual, sha256Hex, utf8Encoder } from "../../auth/crypto"
import { PREFIX } from "../config"
import { oauthError, single } from "../http"
import { isClientMetadataUrl } from "../rules/client-metadata"
import { findRegisteredClient } from "../store/clients"

export type ClientAuthentication =
  | { ok: true; clientId: string; registered: boolean }
  | { ok: false; response: Response }

/** Basic 头里的编号和密钥按表单编码过再 base64（RFC 6749 2.3.1）。没有 Basic 头返回 undefined，格式不对返回 null */
function parseBasic(header: string | null): { id: string; secret: string } | null | undefined {
  const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i)
  if (!header || !/^Basic\b/i.test(header)) return undefined
  if (!match) return null
  try {
    const decoded = atob(match[1]!)
    const separator = decoded.indexOf(":")
    if (separator < 0) return null
    const unescape = (value: string) => decodeURIComponent(value.replace(/\+/g, " "))
    return { id: unescape(decoded.slice(0, separator)), secret: unescape(decoded.slice(separator + 1)) }
  } catch {
    return null
  }
}

function clientFailure(description: string, basicAttempted: boolean): ClientAuthentication {
  return {
    ok: false,
    response: oauthError(
      "invalid_client",
      description,
      401,
      basicAttempted ? { "WWW-Authenticate": 'Basic realm="DeverDesk"' } : undefined,
    ),
  }
}

export async function authenticateClient(
  db: D1Database,
  request: Request,
  params: URLSearchParams,
): Promise<ClientAuthentication> {
  const basic = parseBasic(request.headers.get("Authorization"))
  const basicAttempted = basic !== undefined
  if (basic === null) return clientFailure("The Basic authorization header is malformed.", true)

  const bodyId = single(params, "client_id")
  const bodySecret = single(params, "client_secret")
  if (bodyId === undefined || bodySecret === undefined) {
    return { ok: false, response: oauthError("invalid_request", "client_id and client_secret may appear only once.") }
  }
  if (basic && bodySecret !== null) {
    return { ok: false, response: oauthError("invalid_request", "Use only one client authentication method.") }
  }
  if (basic && bodyId !== null && bodyId !== basic.id) return clientFailure("client_id does not match the authorization header.", true)

  const clientId = basic?.id ?? bodyId
  const secret = basic?.secret ?? bodySecret
  if (!clientId) return clientFailure("client_id is required.", basicAttempted)

  // 身份说明类客户端都是公开客户端：靠 PKCE，不认密钥
  if (clientId.startsWith("https://")) {
    if (!isClientMetadataUrl(clientId)) return clientFailure("client_id is not a valid client metadata URL.", basicAttempted)
    return { ok: true, clientId, registered: false }
  }
  if (!clientId.startsWith(PREFIX.client)) return clientFailure("Unknown client.", basicAttempted)

  const client = await findRegisteredClient(db, clientId)
  if (!client) return clientFailure("Unknown client.", basicAttempted)
  if (client.authMethod === "none") return { ok: true, clientId, registered: true }

  if (!secret || !client.secretHash) return clientFailure("This client must authenticate with its client secret.", basicAttempted)
  const presented = await sha256Hex(secret)
  if (!constantTimeEqual(utf8Encoder.encode(presented), utf8Encoder.encode(client.secretHash))) {
    return clientFailure("The client secret is not valid.", basicAttempted)
  }
  return { ok: true, clientId, registered: true }
}
