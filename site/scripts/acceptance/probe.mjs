// 交互核对：逐页真的点一遍并断言具体的值（照 design/*.md 末尾的交互检查表）。
// 先离线打包：SITE_OFFLINE=1 pnpm build（星数为空、提交用快照，断言才对得上）；运行：pnpm probe
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { launch, openPage, overflowReport } from "./serve.mjs"

const REPO = "https://github.com/evepupil/DeverDesk"
const APP = "https://app.deverdesk.com"
const results = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function check(name, options, run, { allow404 = false } = {}) {
  const { context, page, errors } = await openPage(browser, options)
  try {
    await run(page)
    // 404 页本身就以 404 状态返回，浏览器会记一条加载失败，这一条不算页面报错
    const real = allow404 ? errors.filter((error) => !error.includes("status of 404")) : errors
    assert(real.length === 0, `页面报错：${real.join(" | ")}`)
    results.push(`✓ ${name}`)
  } catch (error) {
    results.push(`✗ ${name}：${error.message.split("\n")[0]}`)
  } finally {
    await context.close()
  }
}

const attr = (page, selector, name) => page.locator(selector).first().getAttribute(name)
// 去掉标题里看不见的换行点（零宽空格），只比较看得见的字
const text = async (page, selector) => (await page.locator(selector).first().innerText()).replace(/\u200b/g, "")
const count = (page, selector) => page.locator(selector).count()
const state = (page) => attr(page, "header[data-nav-state]", "data-nav-state")

function frontmatterTitle(slug, locale) {
  const raw = readFileSync(fileURLToPath(new URL(`../../content/blog/${slug}/${locale}.md`, import.meta.url)), "utf8")
  return /^title:\s*(.+)$/m.exec(raw)?.[1]?.trim()
}

const desk = { width: 1440, height: 900 }
const phone = { width: 390, height: 844, mobile: true }
const browser = await launch()

// ---------- 首页 ----------
await check("首页：语言标记、标题、hreflang", { path: "/zh/", ...desk }, async (page) => {
  assert((await attr(page, "html", "lang")) === "zh-CN", "html lang 不是 zh-CN")
  assert((await page.title()) === "DeverDesk — 一人公司的专业工作台", `标题是 ${await page.title()}`)
  const alternate = await attr(page, 'link[rel="alternate"][hreflang="en"]', "href")
  assert(alternate?.endsWith("/en/"), `英文 hreflang 是 ${alternate}`)
})

await check("顶栏：初始透明、链接地址、试用按钮", { path: "/zh/", ...desk }, async (page) => {
  assert((await state(page)) === "top", `初始状态是 ${await state(page)}`)
  assert((await attr(page, 'a[data-nav-link="blog"]', "href")) === "/zh/blog/", "博客链接不对")
  assert((await attr(page, 'a[data-nav-link="features"]', "href")) === "/zh/#features", "功能链接不对")
  assert((await attr(page, 'a[data-cta="try"]', "href")) === APP, "试用按钮地址不对")
  assert((await attr(page, 'a[data-cta="try"]', "target")) === null, "试用按钮不该新窗口打开")
})

await check("顶栏：往下滚藏起来，往上滚变悬浮", { path: "/zh/", ...desk }, async (page) => {
  await page.mouse.wheel(0, 1500)
  await page.waitForTimeout(500)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(500)
  assert((await state(page)) === "hidden", `往下滚后是 ${await state(page)}`)
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(500)
  assert((await state(page)) === "floating", `往上滚后是 ${await state(page)}`)
})

await check("顶栏：手机菜单开合", { path: "/zh/", ...phone }, async (page) => {
  await page.click("[data-nav-toggle]")
  await page.waitForTimeout(300)
  assert(await page.locator("#mobile-menu").isVisible(), "菜单没出来")
  assert((await attr(page, "[data-nav-toggle]", "aria-expanded")) === "true", "aria-expanded 不是 true")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  assert((await count(page, "#mobile-menu")) === 0, "按 Esc 后菜单还在")
})

await check("语言下拉：打开、当前语言打勾、Esc 和点外面都能关", { path: "/zh/", ...desk }, async (page) => {
  const toggle = page.locator("header [data-locale-toggle]").first()
  assert((await toggle.innerText()).includes("中文"), "下拉按钮没写当前语言")
  await toggle.click()
  await page.waitForTimeout(250)
  assert(await page.locator("header [data-locale-menu]").isVisible(), "下拉菜单没出来")
  assert((await toggle.getAttribute("aria-expanded")) === "true", "aria-expanded 不是 true")
  assert((await attr(page, 'header [data-locale-menu] a[data-locale="zh"]', "aria-checked")) === "true", "当前语言没打勾")
  assert((await attr(page, 'header [data-locale-menu] a[data-locale="en"]', "href")) === "/en/", "英文选项地址不对")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(250)
  assert((await count(page, "header [data-locale-menu]")) === 0, "按 Esc 后菜单还在")
  await toggle.click()
  await page.waitForTimeout(250)
  await page.mouse.click(700, 500)
  await page.waitForTimeout(250)
  assert((await count(page, "header [data-locale-menu]")) === 0, "点外面后菜单还在")
})

await check("语言切换：中文 → 英文并记住", { path: "/zh/", ...desk }, async (page) => {
  await page.locator("header [data-locale-toggle]").first().click()
  await Promise.all([page.waitForURL("**/en/"), page.locator('header [data-locale-menu] a[data-locale="en"]').click()])
  assert((await page.evaluate(() => localStorage.getItem("deverdesk-site:locale"))) === "en", "没有记住语言")
  assert((await text(page, "h1")) === "The professional workbench for indie developers", `英文标题是 ${await text(page, "h1")}`)
})

await check("GitHub 按钮：离线打包不显示星数", { path: "/zh/", ...desk }, async (page) => {
  assert((await attr(page, "a[data-github-button]", "href")) === REPO, "GitHub 按钮地址不对")
  assert((await text(page, "a[data-github-button]")).includes("Star"), "GitHub 按钮没写 Star")
})

await check("首屏：标题、按钮、截图、小字链接", { path: "/zh/", ...desk }, async (page) => {
  assert((await text(page, "h1")) === "独立开发者的专业工作台", `标题是 ${await text(page, "h1")}`)
  assert((await attr(page, 'a[data-cta="hero-try"]', "href")) === APP, "首屏试用按钮地址不对")
  assert((await attr(page, "#top img", "src"))?.endsWith("/screenshots/zh/today.webp"), "首屏截图不对")
  assert((await attr(page, "a[data-hero-pill]", "href")) === REPO, "小字链接不对")
})

await check("技术栈与功能：数量和顺序", { path: "/zh/", ...desk }, async (page) => {
  assert((await count(page, "[data-tech]")) === 12, `技术栈 ${await count(page, "[data-tech]")} 个`)
  assert((await attr(page, "[data-tech]", "data-tech")) === "nextjs", "第一个技术栈不是 nextjs")
  const features = await page.locator("[data-feature]").evaluateAll((els) => els.map((el) => el.getAttribute("data-feature")))
  assert(features.join() === "today,projects,money,quick-add", `功能卡是 ${features.join()}`)
  assert((await count(page, "[data-small-feature]")) === 6, "小功能不是 6 个")
})

await check("导览：点页签切换截图", { path: "/zh/", ...desk }, async (page) => {
  await page.click('[data-tour-tab="ledger"]')
  await page.waitForTimeout(600)
  assert((await count(page, '[data-tour-panel="ledger"]')) === 1, "面板没切到收支")
  assert((await attr(page, "#tour-panel img", "src"))?.endsWith("/screenshots/zh/ledger.webp"), "面板截图不对")
  assert((await attr(page, '[data-tour-tab="ledger"]', "aria-selected")) === "true", "收支页签没选中")
  assert((await attr(page, '[data-tour-tab="today"]', "aria-selected")) === "false", "今天页签还是选中的")
})

await check("导览：方向键切换并移动焦点", { path: "/zh/", ...desk }, async (page) => {
  await page.focus('[data-tour-tab="today"]')
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(500)
  assert((await count(page, '[data-tour-panel="week"]')) === 1, "按 → 没切到本周")
  assert((await page.evaluate(() => document.activeElement?.getAttribute("data-tour-tab"))) === "week", "焦点没移到本周")
})

await check("两种用法与开源：数量、链接、提交快照", { path: "/zh/", ...desk }, async (page) => {
  assert((await count(page, "[data-device]")) === 3, "设备不是 3 个")
  assert((await count(page, "[data-edition]")) === 3, "用法卡不是 3 张")
  assert((await attr(page, 'a[data-cta="os-github"]', "href")) === REPO, "开源区 GitHub 按钮不对")
  assert((await count(page, "[data-commit]")) === 5, `提交 ${await count(page, "[data-commit]")} 条`)
  assert((await attr(page, "[data-commit]", "data-commit")) === "d6ded5c", "第一条提交不对")
  assert((await attr(page, "[data-commit]", "href"))?.endsWith("/commit/d6ded5cd3a4c6915396f90808810b642ba08577f"), "提交链接不对")
  assert((await count(page, '[data-stat="stars"]')) === 0, "离线打包不该显示星数")
  assert((await count(page, "[data-copy-button]")) >= 1, "没有复制按钮")
})

await check("场景墙：自动轮换和点圆点", { path: "/zh/", ...desk }, async (page) => {
  await page.locator("#scenarios").scrollIntoViewIfNeeded()
  assert((await attr(page, "[data-scenario-active]", "data-scenario-active")) === "0", "初始不是第 1 张")
  await page.mouse.move(5, 5)
  await page.waitForTimeout(4600)
  assert((await attr(page, "[data-scenario-active]", "data-scenario-active")) === "1", "4 秒后没换到第 2 张")
  await page.click('[data-scenario-dot="5"]')
  await page.waitForTimeout(800)
  assert((await attr(page, "[data-scenario-active]", "data-scenario-active")) === "5", "点圆点没跳到第 6 张")
})

await check("常见问题：展开一题", { path: "/zh/", ...desk }, async (page) => {
  await page.click('[data-faq-question="product-0"]')
  await page.waitForTimeout(500)
  assert((await attr(page, '[data-faq-question="product-0"]', "aria-expanded")) === "true", "没展开")
  assert(await page.locator("#faq-a-product-0").isVisible(), "答案不可见")
  assert((await text(page, "#faq-a-product-0")).includes("每周回顾"), "答案文字不对")
})

await check("页脚：编辑此页链接", { path: "/zh/", ...desk }, async (page) => {
  assert((await attr(page, "a[data-edit-link]", "href")) === `${REPO}/edit/main/site/src/app/[locale]/page.tsx`, "编辑链接不对")
})

// ---------- 更新日志 ----------
await check("更新日志：标题、版本数、当前页", { path: "/zh/changelog/", ...desk }, async (page) => {
  assert((await attr(page, "html", "lang")) === "zh-CN", "html lang 不对")
  assert((await text(page, "h1")) === "更新日志", "标题不对")
  assert((await text(page, '[data-release-count="5"]')) === "5 个版本", "版本数文字不对")
  assert((await attr(page, 'a[data-nav-link="changelog"]', "aria-current")) === "page", "顶栏没标当前页")
})

await check("更新日志：条目、类型、提交、截图", { path: "/zh/changelog/", ...desk }, async (page) => {
  const ids = await page.locator("[data-release]").evaluateAll((els) => els.map((el) => el.getAttribute("data-release")))
  assert(ids.join() === "release-v0-4-1,release-v0-4-0,release-v0-3-0,release-v0-2-0,release-v0-1-0", `条目是 ${ids.join()}`)
  assert((await count(page, '[data-change-kind="fixed"]')) === 1, "修复类改动不是 1 条")
  assert((await attr(page, '[data-release-commit="e95ef03"]', "href")) === `${REPO}/commit/e95ef03c9771c265cc6d6d5543fa1787d84f54ea`, "提交链接不对")
  assert((await count(page, "[data-release-commit]")) === 12, `提交编号 ${await count(page, "[data-release-commit]")} 个`)
  assert((await attr(page, "#release-v0-4-0 img", "src"))?.endsWith("/screenshots/zh/today.webp"), "v0.4.0 截图不对")
  assert((await count(page, "#release-v0-4-1 img")) === 0, "v0.4.1 不该有截图")
})

await check("更新日志：版本跳转不被顶栏挡住", { path: "/zh/changelog/", ...desk }, async (page) => {
  await page.click('[data-version-link="v0.2.0"]')
  await page.waitForTimeout(1200)
  assert(page.url().endsWith("#release-v0-2-0"), `地址是 ${page.url()}`)
  const top = await page.evaluate(() => document.getElementById("release-v0-2-0")?.getBoundingClientRect().top ?? -1)
  assert(top >= 80 && top < 400, `跳转后条目顶部在 ${top}`)
})

await check("更新日志：英文", { path: "/en/changelog/", ...desk, languages: ["en-US"] }, async (page) => {
  assert((await text(page, "h1")) === "Changelog", "英文标题不对")
  assert((await text(page, '[data-release-count="5"]')) === "5 releases", "英文版本数不对")
  assert((await text(page, "[data-release-body] h2")) === "Live demo, English README and CI", "第一条标题不对")
  assert((await attr(page, "a[data-edit-link]", "href")) === `${REPO}/edit/main/site/src/content/changelog.ts`, "编辑链接不对")
})

// ---------- 博客 ----------
const rows = (page) => page.locator("[data-post-row]").evaluateAll((els) => els.map((el) => el.getAttribute("data-post-row")))

await check("博客列表：标题、总数、置顶、列表顺序", { path: "/zh/blog/", ...desk }, async (page) => {
  assert((await text(page, "h1")) === "博客", "标题不对")
  assert((await count(page, '[data-blog-total="5"]')) === 1, "总数不是 5")
  assert((await attr(page, 'a[data-nav-link="blog"]', "aria-current")) === "page", "顶栏没标当前页")
  assert((await attr(page, 'a[data-featured-post="why-deverdesk"]', "href")) === "/zh/blog/why-deverdesk/", "置顶文章不对")
  assert((await rows(page)).join() === "hourly-rate,deploy-to-cloudflare,local-vs-cloud,quick-add", `列表是 ${(await rows(page)).join()}`)
  assert((await count(page, '[data-post-count="4"]')) === 1, "结果数不是 4")
})

await check("博客列表：标签筛选", { path: "/zh/blog/", ...desk }, async (page) => {
  await page.click('[data-post-tag="guide"]')
  assert((await rows(page)).join() === "deploy-to-cloudflare,quick-add", `教程标签是 ${(await rows(page)).join()}`)
  assert((await attr(page, '[data-post-tag="guide"]', "aria-pressed")) === "true", "标签没按下")
  await page.click('[data-post-tag="guide"]')
  assert((await rows(page)).length === 4, "再点一次没回到全部")
  assert((await attr(page, '[data-post-tag="all"]', "aria-pressed")) === "true", "全部没按下")
})

await check("博客列表：搜索空结果和清除", { path: "/zh/blog/", ...desk }, async (page) => {
  // 受控输入：用原型上的 setter 赋值再派发 input 事件
  await page.locator("[data-post-search]").evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    setter?.call(input, "zzzz")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await page.waitForTimeout(200)
  assert(await page.locator("[data-post-empty]").isVisible(), "没显示空结果")
  assert((await count(page, '[data-post-count="0"]')) === 1, "结果数不是 0")
  await page.click("[data-post-clear]")
  assert((await page.locator("[data-post-search]").inputValue()) === "", "搜索框没清空")
  assert((await rows(page)).length === 4, "清除后不是 4 篇")
})

await check("文章页：标题、目录、跳转、上下篇、编辑", { path: "/zh/blog/hourly-rate/", ...desk }, async (page) => {
  assert((await text(page, "h1")) === frontmatterTitle("hourly-rate", "zh"), `标题是 ${await text(page, "h1")}`)
  const headings = await count(page, "[data-post-body] h2, [data-post-body] h3")
  assert((await count(page, "[data-post-body] h2")) >= 3, "正文二级标题少于 3 个")
  assert((await count(page, "[data-toc-link]")) === headings, `目录 ${await count(page, "[data-toc-link]")} 条，标题 ${headings} 个`)
  const href = await attr(page, "[data-toc-link]", "href")
  await page.click("[data-toc-link]")
  await page.waitForTimeout(800)
  assert(decodeURIComponent(page.url()).endsWith(decodeURIComponent(href ?? "")), `跳转后地址是 ${page.url()}`)
  assert((await attr(page, "a[data-post-edit]", "href")) === `${REPO}/edit/main/site/content/blog/hourly-rate/zh.md`, "编辑链接不对")
  assert((await count(page, 'a[data-post-newer="why-deverdesk"]')) === 1, "上一篇不对")
  assert((await count(page, 'a[data-post-older="deploy-to-cloudflare"]')) === 1, "下一篇不对")
})

await check("博客：英文列表", { path: "/en/blog/", ...desk, languages: ["en-US"] }, async (page) => {
  assert((await text(page, "h1")) === "Blog", "英文标题不对")
  assert((await rows(page)).length === 4, "英文列表不是 4 篇")
})

// ---------- 根地址与 404 ----------
await check("根地址：中文浏览器跳 /zh/", { path: "/", ...desk, languages: ["zh-CN"] }, async (page) => {
  await page.waitForURL("**/zh/")
})
await check("根地址：英文浏览器跳 /en/", { path: "/", ...desk, languages: ["en-US"] }, async (page) => {
  await page.waitForURL("**/en/")
})
await check("根地址：存过中文优先", { path: "/", ...desk, languages: ["en-US"], storage: { "deverdesk-site:locale": "zh" } }, async (page) => {
  await page.waitForURL("**/zh/")
})
await check("404 页", { path: "/nope/", ...desk }, async (page) => {
  assert((await page.locator("body").innerText()).includes("404"), "404 页没写 404")
  assert((await count(page, 'a[href="/zh/"]')) >= 1 && (await count(page, 'a[href="/en/"]')) >= 1, "404 页缺语言入口")
}, { allow404: true })

// ---------- 横向溢出 ----------
for (const path of ["/zh/", "/en/", "/zh/changelog/", "/zh/blog/", "/zh/blog/hourly-rate/", "/en/blog/local-vs-cloud/"]) {
  for (const size of [desk, phone]) {
    await check(`不溢出：${path} ${size.width}`, { path, ...size }, async (page) => {
      const report = await overflowReport(page)
      assert(report.scrollWidth <= report.clientWidth, `页面宽 ${report.scrollWidth} > ${report.clientWidth}：${report.offenders.join(" ; ")}`)
    })
  }
}

await browser.close()
const failed = results.filter((line) => line.startsWith("✗"))
console.log(results.join("\n"))
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
