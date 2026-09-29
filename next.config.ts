import type { NextConfig } from "next"

/**
 * 页面导出成静态文件，任何静态托管都能直接放。
 * 开发时经隧道或局域网域名访问，把域名写进 ALLOWED_DEV_ORIGINS（逗号分隔），放行它加载开发脚本。
 */
const devOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
}

export default nextConfig
