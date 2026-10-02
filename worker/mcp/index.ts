import { createMcpHandler, originValidationResponse, type AuthInfo } from "@modelcontextprotocol/server"
import { findTokenIdentity } from "../db/tokens"
import { MCP_SCOPE, publicOrigin, resourceMetadataUrl, resourceOf } from "../oauth/config"
import { findOAuthIdentity, isOAuthAccessToken } from "../oauth/identity"
import type { TokenIdentity, WorkerEnv } from "../types"
import { productionMcpDependencies, type McpDependencies } from "./deps"
import { createMcpServer } from "./server"

interface DeverDeskAuthInfo extends AuthInfo {
  principal: TokenIdentity
}

function bearerOf(request: Request): string | null {
  return request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null
}

/** 只认 Bearer：dd_ 开头是个人令牌，ddo_ 开头是授权来的通行令牌（要没过期、发给的就是这个 /mcp） */
async function resolveIdentity(
  bearer: string,
  env: WorkerEnv,
  origin: string,
  now: number,
): Promise<TokenIdentity | null> {
  if (isOAuthAccessToken(bearer)) return findOAuthIdentity(env.DB, bearer, resourceOf(origin), now)
  return findTokenIdentity(env.DB, bearer, now)
}

export async function handleMcpRequest(
  request: Request,
  env: WorkerEnv,
  dependencies: McpDependencies = productionMcpDependencies,
): Promise<Response> {
  const originResponse = validateOrigin(request)
  if (originResponse) return originResponse

  const origin = publicOrigin(request, env)
  const bearer = bearerOf(request)
  const identity = bearer ? await resolveIdentity(bearer, env, origin, dependencies.now()) : null
  if (!bearer || !identity) {
    const authorization = request.headers.get("Authorization") ?? ""
    const hasBearer = /^Bearer(?:\s|$)/i.test(authorization)
    return authenticationFailure(hasBearer ? "invalid_token" : "unauthorized", origin)
  }

  const authInfo: DeverDeskAuthInfo = {
    token: bearer,
    clientId: identity.id,
    scopes: [MCP_SCOPE, `tier:${identity.tier}`],
    principal: identity,
  }
  const handler = createMcpHandler((sdkContext) => createMcpServer(dependencies, env, sdkContext))
  return handler.fetch(request, { authInfo })
}

function validateOrigin(request: Request): Response | undefined {
  const origin = request.headers.get("Origin")
  if (origin === null || origin === "") return undefined

  const url = new URL(request.url)
  if (origin !== url.origin) return originValidationResponse(request, [])
  return originValidationResponse(request, [url.hostname])
}

/** 401 告诉客户端资源说明书在哪，ChatGPT、Claude 这类应用据此发现可以走授权 */
function authenticationFailure(error: "unauthorized" | "invalid_token", origin: string): Response {
  const challenge = [
    'Bearer realm="DeverDesk"',
    `resource_metadata="${resourceMetadataUrl(origin)}"`,
    `scope="${MCP_SCOPE}"`,
    ...(error === "invalid_token" ? ['error="invalid_token"'] : []),
  ].join(", ")
  return Response.json({ error }, { status: 401, headers: { "WWW-Authenticate": challenge } })
}
