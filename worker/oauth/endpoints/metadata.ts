// 两份说明书：资源说明书（RFC 9728）告诉 AI 应用「/mcp 归谁授权」，授权方说明书（RFC 8414）列出授权页和换令牌的地址。
import { MCP_RESOURCE_PATH, MCP_SCOPE, OAUTH_PATHS, OFFLINE_SCOPE, resourceOf } from "../config"
import { CLIENT_AUTH_METHODS } from "../clients/types"
import { CORS_HEADERS, methodNotAllowed, preflight } from "../http"

export const METADATA_PATHS: readonly string[] = [
  `${OAUTH_PATHS.resourceMetadata}${MCP_RESOURCE_PATH}`,
  OAUTH_PATHS.resourceMetadata,
  OAUTH_PATHS.authorizationServerMetadata,
]

export function protectedResourceMetadata(origin: string): Record<string, unknown> {
  return {
    resource: resourceOf(origin),
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "DeverDesk",
  }
}

export function authorizationServerMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${OAUTH_PATHS.authorizePage}`,
    token_endpoint: `${origin}${OAUTH_PATHS.token}`,
    registration_endpoint: `${origin}${OAUTH_PATHS.register}`,
    revocation_endpoint: `${origin}${OAUTH_PATHS.revoke}`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [...CLIENT_AUTH_METHODS],
    revocation_endpoint_auth_methods_supported: [...CLIENT_AUTH_METHODS],
    scopes_supported: [MCP_SCOPE, OFFLINE_SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }
}

/** 只收 GET、HEAD 和跨域预检；内容缓存 5 分钟 */
export function handleMetadata(request: Request, pathname: string, origin: string): Response {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD, OPTIONS")
  const body = pathname === OAUTH_PATHS.authorizationServerMetadata
    ? authorizationServerMetadata(origin)
    : protectedResourceMetadata(origin)
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
