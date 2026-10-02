// POST /oauth/register：自助登记（RFC 7591）。Cursor 这类不支持身份说明的客户端用它拿编号。
import { randomBase64Url, sha256Hex } from "../../auth/crypto"
import type { WorkerEnv } from "../../types"
import { PREFIX } from "../config"
import type { OAuthDependencies } from "../clients/types"
import { methodNotAllowed, oauthError, oauthJson, preflight, readJsonObject } from "../http"
import { checkRegistration } from "../rules/registration"
import { countRegisteredClients, deleteUnusedClients, insertClient } from "../store/clients"
import { countHit, deleteStaleHits } from "../store/maintenance"

/** 同一 IP 每小时最多登记 20 次 */
export const REGISTER_LIMIT_PER_WINDOW = 20
export const REGISTER_WINDOW_MS = 60 * 60 * 1000
/** 清理之后还超过这么多就不再收 */
export const MAX_REGISTERED_CLIENTS = 1000
const RATE_KEY = "register:"

export async function handleRegister(request: Request, env: WorkerEnv, deps: OAuthDependencies): Promise<Response> {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS")
  const body = await readJsonObject(request)
  if (!body.ok) return body.response
  const checked = checkRegistration(body.value)
  if (!checked.ok) return oauthError(checked.error, checked.description)

  const now = deps.now()
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown"
  if (await countHit(env.DB, `${RATE_KEY}${ip}`, REGISTER_WINDOW_MS, now) > REGISTER_LIMIT_PER_WINDOW) {
    return oauthError("too_many_requests", "Too many client registrations from this address; try again later.", 429, {
      "Retry-After": String(REGISTER_WINDOW_MS / 1000),
    })
  }
  await deleteUnusedClients(env.DB, now)
  await deleteStaleHits(env.DB, RATE_KEY, REGISTER_WINDOW_MS, now)
  if (await countRegisteredClients(env.DB) >= MAX_REGISTERED_CLIENTS) {
    return oauthError("temporarily_unavailable", "Too many registered clients; try again later.", 503)
  }

  const registration = checked.value
  const clientId = `${PREFIX.client}${randomBase64Url(18)}`
  const secret = registration.authMethod === "none" ? null : `${PREFIX.secret}${randomBase64Url(32)}`
  await insertClient(env.DB, {
    id: clientId,
    name: registration.name,
    redirectUris: registration.redirectUris,
    authMethod: registration.authMethod,
    secretHash: secret === null ? null : await sha256Hex(secret),
  }, now)

  return oauthJson({
    client_id: clientId,
    client_id_issued_at: Math.floor(now / 1000),
    client_name: registration.name,
    redirect_uris: registration.redirectUris,
    grant_types: registration.grantTypes,
    response_types: ["code"],
    token_endpoint_auth_method: registration.authMethod,
    ...(secret === null ? {} : { client_secret: secret, client_secret_expires_at: 0 }),
  }, 201)
}
