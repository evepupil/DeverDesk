// 截图核对：各页面 × 手机 390 / 桌面 1440 × 中英文，按屏切片截图并实测横向溢出；再点出几种交互状态截图。
// 先打包：SITE_OFFLINE=1 pnpm build；运行：pnpm shots [只截名字里含这个词的]
// 输出到 scripts/acceptance/.shots/，报告打印在终端。
import { mkdir, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { launch, openPage, overflowReport } from "./serve.mjs"

const DIR = fileURLToPath(new URL("./.shots/", import.meta.url))
const only = process.argv[2]
await rm(DIR, { recursive: true, force: true })
await mkdir(DIR, { recursive: true })

const PAGES = [
  ["home", "/"],
  ["changelog", "/changelog/"],
  ["blog", "/blog/"],
  ["post", "/blog/hourly-rate/"],
]
const WIDTHS = [
  { label: "1440", width: 1440, height: 900, mobile: false },
  { label: "390", width: 390, height: 844, mobile: true },
]
const LOCALES = [
  { dir: "zh", languages: ["zh-CN"] },
  { dir: "en", languages: ["en-US"] },
]
const MAX_SLICES = 14

const browser = await launch()
const report = []

/** 按屏往下滚着截，每屏一张；顶栏往下滚时会藏起来，这是正常的 */
async function slices(page, name, height) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight)
  let index = 0
  for (let y = 0; y < total && index < MAX_SLICES; y += height, index++) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(450)
    await page.screenshot({ path: `${DIR}${name}-${String(index).padStart(2, "0")}.png` })
  }
  return { total, count: index }
}

for (const locale of LOCALES) {
  for (const [pageName, path] of PAGES) {
    for (const size of WIDTHS) {
      const name = `${locale.dir}-${pageName}-${size.label}`
      if (only && !name.includes(only)) continue
      const { context, page, errors } = await openPage(browser, { path: `/${locale.dir}${path}`, width: size.width, height: size.height, mobile: size.mobile, languages: locale.languages })
      try {
        const overflow = await overflowReport(page)
        const { total, count } = await slices(page, name, size.height)
        const flag = overflow.scrollWidth > overflow.clientWidth ? `溢出 ${overflow.scrollWidth}>${overflow.clientWidth} ${overflow.offenders.join(" ; ")}` : "不溢出"
        report.push(`${name}: 高 ${total}px，${count} 张，${flag}${errors.length ? `，报错 ${errors.join(" | ")}` : ""}`)
      } catch (error) {
        report.push(`${name}: 失败 ${error.message.split("\n")[0]}`)
      } finally {
        await context.close()
      }
    }
  }
}

/** 交互状态：点出来再截 */
async function state(name, options, act, clip = false) {
  if (only && !name.includes(only)) return
  const { context, page, errors } = await openPage(browser, options)
  try {
    await act(page)
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${DIR}state-${name}.png`, fullPage: clip })
    report.push(`state-${name}: ${errors.length ? errors.join(" | ") : "ok"}`)
  } catch (error) {
    report.push(`state-${name}: 失败 ${error.message.split("\n")[0]}`)
  } finally {
    await context.close()
  }
}

const desk = { width: 1440, height: 900 }
const phone = { width: 390, height: 844, mobile: true }

await state("mobile-menu", { path: "/zh/", ...phone }, async (page) => {
  await page.click("[data-nav-toggle]")
})
await state("locale-menu", { path: "/zh/", ...desk }, async (page) => {
  await page.locator("header [data-locale-toggle]").first().click()
})
await state("locale-menu-footer", { path: "/en/", ...desk }, async (page) => {
  await page.locator("footer [data-locale-toggle]").scrollIntoViewIfNeeded()
  await page.locator("footer [data-locale-toggle]").click()
})
await state("nav-floating", { path: "/zh/", ...desk }, async (page) => {
  await page.mouse.wheel(0, 1500)
  await page.waitForTimeout(400)
  await page.mouse.wheel(0, -300)
})
await state("tour-ledger", { path: "/zh/", ...desk }, async (page) => {
  await page.locator("#tour").scrollIntoViewIfNeeded()
  await page.click('[data-tour-tab="ledger"]')
})
await state("faq-open", { path: "/en/", ...desk }, async (page) => {
  await page.locator("#faq").scrollIntoViewIfNeeded()
  await page.click('[data-faq-question="product-2"]')
  await page.click('[data-faq-question="deploy-0"]')
})
await state("scenarios-next", { path: "/zh/", ...desk }, async (page) => {
  await page.locator("#scenarios").scrollIntoViewIfNeeded()
  await page.waitForTimeout(4500)
})
await state("blog-empty", { path: "/zh/blog/", ...desk }, async (page) => {
  await page.locator("[data-post-search]").fill("zzzz")
  await page.locator("#posts").scrollIntoViewIfNeeded()
})
await state("blog-tag", { path: "/en/blog/", ...phone }, async (page) => {
  await page.click('[data-post-tag="guide"]')
  await page.locator("#posts").scrollIntoViewIfNeeded()
})
await state("changelog-middle", { path: "/zh/changelog/", ...desk }, async (page) => {
  await page.mouse.wheel(0, 2600)
})
await state("post-toc", { path: "/zh/blog/deploy-to-cloudflare/", ...desk }, async (page) => {
  await page.mouse.wheel(0, 2200)
})
await state("not-found", { path: "/nope/", ...desk }, async () => {})
await state("root-zh", { path: "/", ...desk, languages: ["zh-CN"] }, async (page) => {
  await page.waitForURL("**/zh/")
})
await state("reduced-motion", { path: "/zh/", ...desk, reducedMotion: "reduce" }, async (page) => {
  await page.locator("#features").scrollIntoViewIfNeeded()
})

await browser.close()
console.log(report.join("\n"))
