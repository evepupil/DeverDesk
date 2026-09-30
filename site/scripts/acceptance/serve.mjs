// 不启动任何服务：浏览器请求 http://site.local/* 时直接从 out/ 读文件返回（和产品的核对脚本同一个做法）。
// 先打包：SITE_OFFLINE=1 pnpm build，再用这里的 launch / openPage 打开页面。
import { readFile, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

export const ORIGIN = "http://site.local"
const OUT = fileURLToPath(new URL("../../out/", import.meta.url))
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** 和 Cloudflare 静态托管的 auto-trailing-slash 一样：目录找 index.html，不带扩展名的找 .html，找不到给 404.html */
async function resolveFile(pathname) {
  const clean = decodeURIComponent(pathname)
  const candidates = clean.endsWith("/")
    ? [join(OUT, clean, "index.html")]
    : [join(OUT, clean), join(OUT, `${clean}.html`), join(OUT, clean, "index.html")]
  for (const candidate of candidates) if (await isFile(candidate)) return { file: candidate, status: 200 }
  return { file: join(OUT, "404.html"), status: 404 }
}

async function serve(route) {
  const url = new URL(route.request().url())
  const { file, status } = await resolveFile(url.pathname)
  const body = await readFile(file)
  await route.fulfill({ status, body, contentType: TYPES[extname(file)] ?? "application/octet-stream" })
}

export async function launch() {
  return chromium.launch({ channel: "msedge", headless: true })
}

/**
 * 打开一页。width / height 是视口，mobile 为真时按手机仿真（触屏、3 倍像素），languages 是浏览器语言，
 * cookies 是打开前预先写好的 Cookie（名 → 值）。
 * 站外请求（GitHub、演示站、统计脚本）一律拦掉，只返回空响应，核对不依赖外网，也不会往统计后台报数。
 */
export async function openPage(browser, { path = "/zh/", width = 1440, height = 900, mobile = false, languages = ["zh-CN"], reducedMotion = "no-preference", cookies } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 3 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: languages[0],
    reducedMotion,
  })
  if (cookies) {
    await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: ORIGIN })))
  }
  await context.route(`${ORIGIN}/**`, serve)
  await context.route((url) => !url.href.startsWith(ORIGIN) && !url.href.startsWith("data:"), (route) => route.fulfill({ status: 204, body: "" }))
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`)
  })
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(300)
  return { context, page, errors }
}

/** 页面横向溢出检查：返回页面宽度、视口宽度和最多 8 个越界元素（排除横向滚动容器里的） */
export async function overflowReport(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const vw = doc.clientWidth
    const offenders = []
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.right <= vw + 1) continue
      let parent = el.parentElement
      let clipped = false
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent)
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) {
          clipped = true
          break
        }
        parent = parent.parentElement
      }
      if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(rect.right)}`)
      if (offenders.length >= 8) break
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: vw, offenders }
  })
}
