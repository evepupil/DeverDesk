"use client"

import Script from "next/script"

import { ANALYTICS_TOKEN, IS_LOCAL_EDITION } from "@/lib/edition"

/** 本地版演示站的 Cloudflare 网页统计：只有配了令牌才加载；在线版是用户自己的部署，不加统计 */
export function Analytics() {
  if (!IS_LOCAL_EDITION || !ANALYTICS_TOKEN) return null

  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token: ANALYTICS_TOKEN })}
    />
  )
}
