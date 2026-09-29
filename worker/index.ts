// 将 /api/* 分发给 Worker，其余请求原样交由静态资源绑定处理。
import { dispatchApi } from "./routes"
import type { WorkerContext, WorkerEnv } from "./types"

const worker = {
  async fetch(request: Request, env: WorkerEnv, context: WorkerContext): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return dispatchApi(request, env, context)
    }
    return env.ASSETS.fetch(request)
  },
}

export default worker
