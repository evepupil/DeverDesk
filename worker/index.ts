// 分流：/mcp 交给 MCP 服务，OAuth 的说明书、/oauth/*、授权页交给 OAuth，/api/* 交给接口路由，其余交给静态资源。
import { dispatchApi } from "./routes"
import { handleMcpRequest } from "./mcp"
import { handleOAuthRequest } from "./oauth"
import type { WorkerContext, WorkerEnv } from "./types"

const worker = {
  async fetch(request: Request, env: WorkerEnv, context: WorkerContext): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === "/mcp") {
      return handleMcpRequest(request, env)
    }
    const oauth = await handleOAuthRequest(request, env)
    if (oauth) return oauth
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return dispatchApi(request, env, context)
    }
    return env.ASSETS.fetch(request)
  },
}

export default worker
