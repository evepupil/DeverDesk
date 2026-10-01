import type { NextConfig } from "next"

/**
 * 页面导出成静态文件，任何静态托管都能直接放。
 * 开发时经隧道或局域网域名访问，把域名写进 ALLOWED_DEV_ORIGINS（逗号分隔），放行它加载开发脚本。
 */
const devOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

// 开发时把 /api 和 /mcp 转给 wrangler dev 起的本地接口（scripts/dev.mjs 会设置 DEVERDESK_API_PROXY）。
// 只在开发模式生效；静态导出不支持 rewrites，打包时绝不带上。
const apiProxy = process.env.DEVERDESK_API_PROXY
const apiRewrites = buildDevRewrites(apiProxy, process.env.NODE_ENV)

export function buildDevRewrites(apiProxy: string | undefined, nodeEnv: string | undefined) {
  if (nodeEnv !== "development" || !apiProxy) return []
  return [
    { source: "/api/:path*", destination: `${apiProxy}/api/:path*` },
    { source: "/mcp/:path*", destination: `${apiProxy}/mcp/:path*` },
  ]
}

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...(apiRewrites.length > 0 ? { rewrites: async () => apiRewrites } : {}),
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
}

export default nextConfig
