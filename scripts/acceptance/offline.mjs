// 不启动任何服务：浏览器请求 http://deverdesk.local/* 时直接从 out/ 目录读文件返回
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

export async function openPage(browser, { width = 1440, height = 900, mobile = false, path = "/" } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 3 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  })
  await context.route(`${ORIGIN}/**`, serve)
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
