import Script from "next/script"
import { ANALYTICS_TOKEN } from "@/content/site"

/**
 * Cloudflare 网页统计：看每天来多少人、从哪个网站来、看了哪些页。不用 Cookie，不记个人信息。
 * 没配令牌时什么都不渲染；放在各语言根布局和 404 页里，根地址的跳转页不放（它只负责跳走）。
 */
export function Analytics() {
  if (!ANALYTICS_TOKEN) return null

  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token: ANALYTICS_TOKEN })}
    />
  )
}
