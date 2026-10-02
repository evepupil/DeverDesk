// GET /authorize：授权页本身是静态页面，Worker 先接住，加上防嵌入、不缓存、不外传地址的响应头再交出去。
import type { WorkerEnv } from "../../types"

const PAGE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
}

export async function serveAuthorizePage(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } })
  }
  const asset = await env.ASSETS.fetch(request)
  const headers = new Headers(asset.headers)
  for (const [name, value] of Object.entries(PAGE_HEADERS)) headers.set(name, value)
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers })
}
