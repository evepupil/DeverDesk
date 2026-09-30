import { resolve } from "node:path"
import type { NextConfig } from "next"

/**
 * 官网导出成纯静态文件（out/），任何静态托管都能放。
 * - trailingSlash：每页导出成「目录/index.html」，站内链接一律写成带结尾斜杠的地址。
 * - turbopack.root：仓库根目录还有产品自己的锁文件，把根目录钉在 site/，免得往上找错。
 * - globalNotFound：全站只有按语言分的两个根布局，没有统一的根布局，404 页单独给一份完整 HTML。
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: { root: resolve(".") },
  experimental: { globalNotFound: true },
}

export default nextConfig
