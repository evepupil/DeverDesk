// OAuth 授权的入口：两份说明书、/oauth/*（换令牌、登记、注销）、授权页 /authorize。
// 不归这里管的路径返回 null，交回 Worker 入口继续分流。规则见 docs/模块设计/OAuth授权.md。
import type { WorkerEnv } from "../types"
import { OAUTH_PATHS, publicOrigin } from "./config"
import { productionOAuthDependencies, type OAuthDependencies } from "./clients/types"
import { serveAuthorizePage } from "./endpoints/authorize-page"
import { handleMetadata, METADATA_PATHS } from "./endpoints/metadata"
import { handleRegister } from "./endpoints/register"
import { handleRevoke } from "./endpoints/revoke"
import { handleToken } from "./endpoints/token"
import { oauthError } from "./http"

async function route(request: Request, env: WorkerEnv, pathname: string, deps: OAuthDependencies): Promise<Response | null> {
  if (METADATA_PATHS.includes(pathname)) return handleMetadata(request, pathname, publicOrigin(request, env))
  if (pathname === OAUTH_PATHS.token) return handleToken(request, env, deps)
  if (pathname === OAUTH_PATHS.register) return handleRegister(request, env, deps)
  if (pathname === OAUTH_PATHS.revoke) return handleRevoke(request, env)
  if (pathname === OAUTH_PATHS.authorizePage) return serveAuthorizePage(request, env)
  if (pathname.startsWith("/oauth/")) return oauthError("invalid_request", "Unknown OAuth endpoint.", 404)
  return null
}

export async function handleOAuthRequest(
  request: Request,
  env: WorkerEnv,
  deps: OAuthDependencies = productionOAuthDependencies,
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  try {
    return await route(request, env, pathname, deps)
  } catch (error) {
    console.error("OAuth request failed", pathname, error)
    return oauthError("server_error", "The server could not complete the request.", 500)
  }
}
