import { createMcpHandler, originValidationResponse, type AuthInfo } from "@modelcontextprotocol/server"
import { resolveBearerToken } from "../auth"
import type { TokenIdentity, WorkerEnv } from "../types"
import { productionMcpDependencies, type McpDependencies } from "./deps"
import { createMcpServer } from "./server"

interface DeverDeskAuthInfo extends AuthInfo {
  principal: TokenIdentity
}

export async function handleMcpRequest(
  request: Request,
  env: WorkerEnv,
  dependencies: McpDependencies = productionMcpDependencies,
): Promise<Response> {
  const originResponse = validateOrigin(request)
  if (originResponse) return originResponse

  const identity = await resolveBearerToken(request, env)
  if (!identity) {
    const authorization = request.headers.get("Authorization") ?? ""
    const hasBearer = /^Bearer(?:\s|$)/i.test(authorization)
    return authenticationFailure(hasBearer ? "invalid_token" : "unauthorized")
  }

  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!bearer) return authenticationFailure("invalid_token")

  const authInfo: DeverDeskAuthInfo = {
    token: bearer,
    clientId: identity.id,
    scopes: ["mcp", `tier:${identity.tier}`],
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

function authenticationFailure(error: "unauthorized" | "invalid_token"): Response {
  return Response.json(
    { error },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": error === "invalid_token"
          ? 'Bearer realm="DeverDesk", error="invalid_token"'
          : 'Bearer realm="DeverDesk"',
      },
    },
  )
}
