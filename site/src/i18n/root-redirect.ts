import { parseAcceptLanguage, pickLocale, readLocaleCookie } from "./locales"

/**
 * 根地址 / 在服务端选好语言直接跳（官网的 Worker 调用，见 worker/index.ts）。
 * 选法和兜底脚本一样：Cookie 里记过的优先 → 浏览器语言有 zh 开头的用中文 → 其余英文。
 *
 * 为什么放在服务端：服务端的 302 跳转，浏览器会把访客原来的来源（从哪个网站点进来的）带到 /zh/ 或 /en/，
 * 访问统计才分得清来源、数得对访问次数；在页面里用脚本跳，来源会变成官网自己，这两样就都丢了。
 *
 * 只管根地址的 GET / HEAD 请求，其余返回 null，交回静态资源处理。
 */
export function rootRedirect(request: Request): Response | null {
  const url = new URL(request.url)
  if (url.pathname !== "/" || (request.method !== "GET" && request.method !== "HEAD")) return null

  const locale = pickLocale(readLocaleCookie(request.headers.get("Cookie")), parseAcceptLanguage(request.headers.get("Accept-Language")))
  return new Response(null, {
    status: 302,
    headers: {
      // 查询参数原样带过去（比如推广链接上的 ?ref=）；地址里的 # 锚点由浏览器自己带上
      Location: new URL(`/${locale}/${url.search}`, url).toString(),
      // 同一个地址按语言和 Cookie 跳到不同页面，不能缓存
      "Cache-Control": "no-store",
      Vary: "Accept-Language, Cookie",
    },
  })
}
