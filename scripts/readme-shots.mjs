// README 用的截图：中英文各几页，2 倍像素，输出到 docs/assets/screenshots/<语言>/
// 先打包本地版（带样例数据）：pnpm build:local；再运行：pnpm shots:readme
import { mkdir } from "node:fs/promises"
import { launch, openPage } from "./acceptance/offline.mjs"

const LANGUAGES = [
  { dir: "en", locale: "en-US" },
  { dir: "zh-CN", locale: "zh-CN" },
]
const PAGES = [
  { name: "today", path: "/" },
  { name: "tasks", path: "/tasks" },
  { name: "insights", path: "/insights" },
  { name: "ledger", path: "/ledger" },
]

const browser = await launch()
for (const language of LANGUAGES) {
  const dir = `docs/assets/screenshots/${language.dir}`
  await mkdir(dir, { recursive: true })
  for (const page of PAGES) {
    const { context, page: tab, errors } = await openPage(browser, {
      path: page.path,
      width: 1440,
      height: 900,
      scale: 2,
      locale: language.locale,
    })
    await tab.waitForTimeout(400)
    await tab.screenshot({ path: `${dir}/${page.name}.jpg`, type: "jpeg", quality: 88 })
    console.log(`${dir}/${page.name}.jpg ${errors.length ? errors.join(" | ") : "ok"}`)
    await context.close()
  }
}
await browser.close()
