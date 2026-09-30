// 官网用的产品截图：打开产品本地版的打包结果（仓库根目录的 out/，先在仓库根目录跑 pnpm build:local），
// 中文、英文各截 8 个页面（1440×900，2 倍像素）和手机上的「今天」页（390×844，3 倍像素），
// 在浏览器里转成 WebP，存到 site/public/screenshots/<语言>/。
// 用法（在 site/ 里）：pnpm shots:app
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { launch, openPage } from "../../scripts/acceptance/offline.mjs"

const OUT = fileURLToPath(new URL("../public/screenshots/", import.meta.url))
const LANGUAGES = [
  { dir: "zh", locale: "zh-CN" },
  { dir: "en", locale: "en-US" },
]
const PAGES = [
  ["today", "/"],
  ["week", "/week"],
  ["tasks", "/tasks"],
  ["projects", "/projects"],
  ["ledger", "/ledger"],
  ["insights", "/insights"],
  ["review", "/review"],
  ["routines", "/routines"],
]
const QUALITY = 0.82

/** 借当前页面的画布把 PNG 转成 WebP（不用装图片处理库） */
async function toWebp(page, png) {
  const dataUrl = await page.evaluate(
    async ({ base64, quality }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      canvas.getContext("2d").drawImage(image, 0, 0)
      return canvas.toDataURL("image/webp", quality)
    },
    { base64: png.toString("base64"), quality: QUALITY },
  )
  return Buffer.from(dataUrl.split(",")[1], "base64")
}

const browser = await launch()
for (const language of LANGUAGES) {
  const dir = `${OUT}${language.dir}`
  await mkdir(dir, { recursive: true })
  for (const [name, path] of PAGES) {
    const { context, page, errors } = await openPage(browser, { path, width: 1440, height: 900, scale: 2, locale: language.locale })
    await page.waitForTimeout(700)
    const webp = await toWebp(page, await page.screenshot({ type: "png" }))
    await writeFile(`${dir}/${name}.webp`, webp)
    console.log(`${language.dir}/${name}.webp ${(webp.length / 1024).toFixed(0)}KB ${errors.length ? errors.join(" | ") : "ok"}`)
    await context.close()
  }
  const { context, page, errors } = await openPage(browser, { path: "/", width: 390, height: 844, mobile: true, scale: 3, locale: language.locale })
  await page.waitForTimeout(700)
  const webp = await toWebp(page, await page.screenshot({ type: "png" }))
  await writeFile(`${dir}/today-mobile.webp`, webp)
  console.log(`${language.dir}/today-mobile.webp ${(webp.length / 1024).toFixed(0)}KB ${errors.length ? errors.join(" | ") : "ok"}`)
  await context.close()
}
await browser.close()
