// 截图：各页面、各宽度和关键交互状态，全部离线加载导出文件
import { mkdir } from "node:fs/promises"
import { launch, openPage } from "./offline.mjs"

const dir = process.argv[2] ?? "scripts/acceptance/.shots"
const only = process.argv[3]
await mkdir(dir, { recursive: true })
const browser = await launch()
const report = []

async function shot(name, options, act) {
  if (only && !name.includes(only)) return
  const { context, page, errors } = await openPage(browser, options)
  try {
    if (act) await act(page)
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: options.fullPage ?? false })
    report.push(`${name}: ${errors.length ? errors.join(" | ") : "ok"}`)
  } catch (error) {
    report.push(`${name}: FAILED ${error.message.split("\n")[0]}`)
  } finally {
    await context.close()
  }
}

const desk = { width: 1440, height: 960 }
const phone = { width: 390, height: 844, mobile: true }

// 页面 × 宽度
await shot("01-today-1440", { path: "/", ...desk })
await shot("02-today-1280", { path: "/", width: 1280, height: 860 })
await shot("03-today-1024", { path: "/", width: 1024, height: 900 })
await shot("04-today-768", { path: "/", width: 768, height: 1024 })
await shot("05-today-390", { path: "/", ...phone })
await shot("06-week-1440", { path: "/week", ...desk })
await shot("07-week-390", { path: "/week", ...phone })
await shot("08-tasks-board-1440", { path: "/tasks", ...desk })
await shot("09-tasks-list-1440", { path: "/tasks", ...desk }, async (page) => {
  await page.getByRole("radio", { name: "列表" }).click()
})
await shot("10-tasks-390", { path: "/tasks", ...phone })
await shot("11-projects-1440", { path: "/projects", ...desk })
await shot("12-project-sheet", { path: "/projects?open=p-templates", ...desk })
await shot("13-ledger-1440", { path: "/ledger", ...desk })
await shot("14-ledger-390", { path: "/ledger", ...phone })
await shot("15-insights-1440", { path: "/insights", ...desk })
await shot("16-insights-1280-full", { path: "/insights", width: 1280, height: 860, fullPage: true })
await shot("17-review-1440", { path: "/review", ...desk })
await shot("18-routines-1440", { path: "/routines", ...desk })

// 交互状态
await shot("19-task-sheet", { path: "/", ...desk }, async (page) => {
  await page.getByRole("button", { name: "排查 Claude 接口超时", exact: true }).first().click()
})
await shot("20-command", { path: "/", ...desk }, async (page) => {
  await page.keyboard.press("Control+K")
  await page.keyboard.type("模板")
})
await shot("21-notifications", { path: "/", ...desk }, async (page) => {
  await page.getByRole("button", { name: /^提醒/ }).click()
})
await shot("22-quick-add-parse", { path: "/", ...desk }, async (page) => {
  await page.getByLabel("快速添加任务").first().fill("写周报 30m #技术博客 明天 !!")
})
await shot("23-timer-running", { path: "/", ...desk }, async (page) => {
  await page.getByRole("button", { name: /开始计时：列文章大纲|开始计时：回复后台留言/ }).first().click({ force: true })
  await page.waitForTimeout(1200)
})
await shot("24-timeline-slot", { path: "/", ...desk }, async (page) => {
  const grid = page.locator("[data-block]").first().locator("xpath=../..")
  const box = await grid.boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + 60)
})
await shot("25-entry-form", { path: "/ledger", ...desk }, async (page) => {
  await page.getByRole("button", { name: "记一笔" }).first().click()
  await page.getByRole("button", { name: "记下" }).click()
})
await shot("26-mobile-capture", { path: "/", ...phone }, async (page) => {
  await page.getByRole("button", { name: "快速记录" }).click()
})
await shot("27-mobile-nav", { path: "/", ...phone }, async (page) => {
  await page.getByRole("button", { name: "打开导航" }).click()
})
await shot("28-empty-start", { path: "/", ...desk }, async (page) => {
  await page.getByRole("button", { name: /DeverDesk/ }).first().click()
  await page.getByRole("menuitem", { name: /清空样例/ }).click()
  await page.getByRole("button", { name: "清空", exact: true }).click()
  await page.waitForTimeout(500)
})
await shot("29-save-failed", { path: "/?fail=save", ...desk }, async (page) => {
  await page.getByLabel("快速添加任务").first().fill("测试保存失败 15m")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(500)
})

console.log(report.join("\n"))
await browser.close()
