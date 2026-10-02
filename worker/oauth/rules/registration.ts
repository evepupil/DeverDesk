// 自助登记（RFC 7591）请求内容的检查。纯函数。
import { CLIENT_AUTH_METHODS, type ClientAuthMethod } from "../clients/types"
import { displayName } from "./client-metadata"
import { isAcceptableRedirectUri, redirectUriHost } from "./redirect-uri"

export const MAX_REGISTERED_REDIRECT_URIS = 10
const SUPPORTED_GRANT_TYPES = ["authorization_code", "refresh_token"] as const

export interface Registration {
  name: string
  redirectUris: string[]
  authMethod: ClientAuthMethod
  grantTypes: string[]
}

export type RegistrationCheck =
  | { ok: true; value: Registration }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string }

function isAuthMethod(value: unknown): value is ClientAuthMethod {
  return CLIENT_AUTH_METHODS.some((method) => method === value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export function checkRegistration(metadata: Record<string, unknown>): RegistrationCheck {
  const uris = metadata.redirect_uris
  if (!isStringArray(uris) || uris.length === 0 || uris.length > MAX_REGISTERED_REDIRECT_URIS) {
    return { ok: false, error: "invalid_redirect_uri", description: `redirect_uris must list 1-${MAX_REGISTERED_REDIRECT_URIS} URIs.` }
  }
  // 不合格的去掉、合格的照常登记（RFC 7591 允许服务器改写）：Cursor 会同时报一个 cursor:// 地址，授权时用的是本机地址
  const accepted = [...new Set(uris.filter((uri) => isAcceptableRedirectUri(uri)))]
  if (accepted.length === 0) {
    return { ok: false, error: "invalid_redirect_uri", description: "Redirect URIs must use https, or http on localhost, without a fragment." }
  }

  // 没写认证方式按公开客户端处理：MCP 客户端几乎都是公开客户端，靠 PKCE
  const method = metadata.token_endpoint_auth_method ?? "none"
  if (!isAuthMethod(method)) {
    return { ok: false, error: "invalid_client_metadata", description: "token_endpoint_auth_method must be none, client_secret_basic or client_secret_post." }
  }

  const grantTypes = metadata.grant_types ?? [...SUPPORTED_GRANT_TYPES]
  if (!isStringArray(grantTypes) || !grantTypes.includes("authorization_code")) {
    return { ok: false, error: "invalid_client_metadata", description: "grant_types must include authorization_code." }
  }
  const responseTypes = metadata.response_types
  if (responseTypes !== undefined && (!isStringArray(responseTypes) || !responseTypes.includes("code"))) {
    return { ok: false, error: "invalid_client_metadata", description: "response_types must include code." }
  }

  return {
    ok: true,
    value: {
      name: displayName(metadata.client_name, redirectUriHost(accepted[0]!)),
      redirectUris: accepted,
      authMethod: method,
      grantTypes: SUPPORTED_GRANT_TYPES.filter((type) => grantTypes.includes(type)),
    },
  }
}
