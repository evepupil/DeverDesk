// 分享卡片图（Open Graph）：截中英文首页的首屏（1200×630），存成 public/og/<语言>.png。
// 页面元数据里的分享图默认指向这两张。先离线打包（SITE_OFFLINE=1 pnpm build），再运行：pnpm og；
// 生成后再打包一次，新图才会进 out/。
import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { launch, openPage } from "./acceptance/serve.mjs"

const OUT = fileURLToPath(new URL("../public/og/", import.meta.url))
await mkdir(OUT, { recursive: true })
const browser = await launch()
for (const [locale, languages] of [
  ["zh", ["zh-CN"]],
  ["en", ["en-US"]],
]) {
  const { context, page } = await openPage(browser, { path: `/${locale}/`, width: 1200, height: 630, languages, reducedMotion: "reduce" })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}${locale}.png` })
  console.log(`og/${locale}.png`)
  await context.close()
}
await browser.close()
