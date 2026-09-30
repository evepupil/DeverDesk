// 不启动任何服务：浏览器请求 http://deverdesk.local/* 时直接从 out/ 目录读文件返回
// 核对脚本是对本地版的打包结果跑的：先 `pnpm build:local`，再用这里的脚本打开 out/。
import { chromium } from "playwright-core"
import { readFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const ORIGIN = "http://deverdesk.local"
const OUT = fileURLToPath(new URL("../../out/", import.meta.url))
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
}

async function serve(route) {
  const url = new URL(route.request().url())
  let path = decodeURIComponent(url.pathname)
  if (path.endsWith("/")) path += "index.html"
  let file = join(OUT, path)
  if (!extname(path)) file += ".html"
  try {
    const body = await readFile(file)
    await route.fulfill({ status: 200, body, contentType: TYPES[extname(file)] ?? "application/octet-stream" })
  } catch {
    await route.fulfill({ status: 404, body: "not found" })
  }
}

export async function launch() {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  return browser
}

export async function openPage(
  browser,
  { width = 1440, height = 900, mobile = false, path = "/", showLocalNotice = false, locale = "zh-CN", scale } = {},
) {
  // locale 是浏览器语言：没选过界面语言时，页面按它决定用中文还是英文；scale 是像素倍数（README 截图用 2 倍）
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale ?? (mobile ? 3 : 1),
    isMobile: mobile,
    hasTouch: mobile,
    locale,
    timezoneId: "Asia/Shanghai",
  })
  // 默认把「本地版说明弹框」标记成看过，页面加载时它就不会自动弹出来挡截图；
  // 想看弹框本身就把 showLocalNotice 传 true。
  if (!showLocalNotice) {
    await context.addInitScript((key) => {
      window.localStorage.setItem(key, "1")
    }, "deverdesk:local-notice-seen")
  }
  await context.route(`${ORIGIN}/**`, serve)
  // 本地版配了统计令牌时会加载 Cloudflare 统计脚本；核对时不连外网，直接给个空脚本
  await context.route("https://static.cloudflareinsights.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "" })
  )
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(400)
  return { context, page, errors }
}
