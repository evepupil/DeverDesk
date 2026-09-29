// 交互探针：真的点一遍核心操作，检查界面上的数字前后一致
import { launch, openPage } from "./offline.mjs"

const browser = await launch()
const results = []
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)

async function run(name, options, body) {
  const { context, page, errors } = await openPage(browser, { width: 1440, height: 960, ...options })
  try {
    await body(page)
    if (errors.length) check(`${name}：没有页面报错`, false, errors.join(" | "))
  } catch (error) {
    check(name, false, error.message.split("\n")[0])
  } finally {
    await context.close()
  }
}

const sidebarCount = async (page, label) =>
  (await page.locator("nav[aria-label='主导航'] a", { hasText: label }).first().locator("span.tabular").textContent())?.trim()

// 1. 快速添加：回车后出现在今天的计划里，侧栏计数跟着变，刷新后还在
await run("快速添加", {}, async (page) => {
  const before = await sidebarCount(page, "今天")
  await page.getByLabel("快速添加任务").first().fill("探针任务 45m #技术博客 !!")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(300)
  const card = page.getByRole("button", { name: "探针任务", exact: true })
  check("快速添加：卡片出现在今天的计划", (await card.count()) > 0)
  const after = await sidebarCount(page, "今天")
  check("快速添加：侧栏「今天」计数加一", before !== after, `${before} → ${after}`)
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(400)
  check("快速添加：刷新后还在（存到了本机）", (await page.getByRole("button", { name: "探针任务", exact: true }).count()) > 0)
})

// 2. 自动排进时间线：没排时间的任务都有了开始时间
await run("自动排", {}, async (page) => {
  const meta = page.locator("section", { hasText: "时间线" }).first()
  const hasUnscheduled = (await meta.textContent())?.includes("还没排时间")
  await page.getByRole("button", { name: /自动排/ }).click()
  await page.waitForTimeout(300)
  const text = await page.locator("section", { hasText: "时间线" }).first().textContent()
  check("自动排：之前有没排时间的任务", Boolean(hasUnscheduled))
  check("自动排：排完后不再提示没排时间", !text?.includes("还没排时间"), text?.slice(0, 40))
  check("自动排：给出撤销入口", (await page.getByRole("button", { name: "撤销" }).count()) > 0)
})

// 3. 拖动时间线上的块：往下拖一小时，开始时间跟着变
await run("拖动时间块", {}, async (page) => {
  const block = page.locator("[data-block]", { hasText: "做个人工作台模板的在线演示" })
  const box = await block.boundingBox()
  if (!box) throw new Error("没找到时间块")
  await page.mouse.move(box.x + box.width / 2, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 4 })
  await page.mouse.move(box.x + box.width / 2, box.y + 10 + 56, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const label = await page.locator("[data-block]", { hasText: "做个人工作台模板的在线演示" }).getAttribute("aria-label")
  check("拖动时间块：从 20:30 挪到 21:30", Boolean(label?.includes("21:30")), label ?? "")
  const card = await page.locator("div", { hasText: /^21:30T-830/ }).count()
  check("拖动时间块：左侧卡片的时间同步变成 21:30", card > 0 || (await page.getByText("21:30", { exact: true }).count()) > 0)
})

// 4. 键盘调整时间块：选中后按下方向键挪 15 分钟
await run("键盘挪时间块", {}, async (page) => {
  const block = page.locator("[data-block]", { hasText: "排查 Claude 接口超时" })
  await block.focus()
  await page.keyboard.press("ArrowDown")
  await page.waitForTimeout(200)
  const label = await block.getAttribute("aria-label")
  check("键盘挪时间块：19:30 → 19:45", Boolean(label?.includes("19:45")), label ?? "")
})

// 5. 把卡片拖到时间线的空白处
await run("拖卡片进时间线", {}, async (page) => {
  const card = page.getByRole("button", { name: "回复后台留言", exact: true }).first()
  const source = card.locator("xpath=ancestor::div[@draggable='true'][1]")
  const grid = page.locator("[data-block]").first().locator("xpath=../..")
  const box = await grid.boundingBox()
  if (!box) throw new Error("没找到时间线")
  await source.dragTo(grid, { targetPosition: { x: box.width / 2, y: 40 } })
  await page.waitForTimeout(300)
  check("拖卡片进时间线：出现对应的时间块", (await page.locator("[data-block]", { hasText: "回复后台留言" }).count()) > 0)
})

// 6. 标记到账：待到账少一笔，本月净收入增加
await run("标记到账", { path: "/ledger" }, async (page) => {
  const pendingHeader = page.locator("section", { hasText: "待到账" }).first()
  const before = await pendingHeader.locator("span.tabular").first().textContent()
  const row = page.locator("div.group", { hasText: "本周销售 · 待平台结算" }).first()
  await row.getByRole("button", { name: /的操作/ }).click()
  await page.getByRole("menuitem", { name: "标记已到账" }).click()
  await page.waitForTimeout(300)
  const after = await page.locator("section", { hasText: "待到账" }).first().locator("span.tabular").first().textContent()
  check("标记到账：待到账从 3 笔变 2 笔", before?.trim() === "3" && after?.trim() === "2", `${before} → ${after}`)
  check("标记到账：侧栏「待到账」计数同步", (await sidebarCount(page, "待到账")) === "2")
})

// 7. 例行勾选：今天页勾一下，计数加一
await run("例行勾选", {}, async (page) => {
  const before = await sidebarCount(page, "例行")
  await page.getByRole("checkbox", { name: /晨间写作/ }).first().click()
  await page.waitForTimeout(200)
  const after = await sidebarCount(page, "例行")
  check("例行勾选：侧栏计数变化", before !== after, `${before} → ${after}`)
})

// 8. 看板拖动改状态：从待办拖到进行中
await run("看板拖动", { path: "/tasks" }, async (page) => {
  const card = page.getByRole("button", { name: "预约体检", exact: true }).first()
  const source = card.locator("xpath=ancestor::div[@draggable='true'][1]")
  const target = page.locator("section", { has: page.getByRole("heading", { name: "进行中" }) }).first()
  await source.dragTo(target)
  await page.waitForTimeout(300)
  const doingColumn = page.locator("section", { has: page.getByRole("heading", { name: "进行中" }) }).first()
  check("看板拖动：卡片到了进行中一列", (await doingColumn.getByRole("button", { name: "预约体检", exact: true }).count()) > 0)
})

// 9. 快捷键：C 新建任务，G 再 W 去本周
await run("快捷键", {}, async (page) => {
  await page.locator("body").click({ position: { x: 5, y: 900 } })
  await page.keyboard.press("c")
  await page.waitForTimeout(200)
  check("快捷键：C 打开新建任务", (await page.getByRole("dialog", { name: "新建任务" }).count()) > 0)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  await page.keyboard.press("g")
  await page.keyboard.press("w")
  await page.waitForURL(/\/week/, { timeout: 3000 })
  check("快捷键：G W 跳到本周", page.url().includes("/week"))
})

// 10. 计时：开始后窗口栏出现计时条，停止后投入记录多一段
await run("计时", {}, async (page) => {
  await page.getByRole("button", { name: "开始计时：回复后台留言" }).first().click({ force: true })
  await page.waitForTimeout(300)
  check("计时：窗口栏出现计时条", (await page.getByRole("button", { name: /正在计时：回复后台留言/ }).count()) > 0)
  await page.getByRole("button", { name: "停止计时" }).first().click()
  await page.waitForTimeout(300)
  check("计时：不足一分钟时提示没有记录", (await page.getByText("不到一分钟，没有记录").count()) > 0)
})

// 11. 周计划：把「还没安排」的任务拖到周五
await run("周计划拖动", { path: "/week" }, async (page) => {
  const card = page.getByRole("button", { name: "压测高峰时段并发", exact: true }).first()
  const source = card.locator("xpath=ancestor::div[@draggable='true'][1]")
  const friday = page.locator("section", { has: page.getByRole("heading", { name: "周五" }) }).first()
  await source.dragTo(friday)
  await page.waitForTimeout(300)
  check("周计划拖动：任务出现在周五", (await friday.getByRole("button", { name: "压测高峰时段并发", exact: true }).count()) > 0)
})

// 12. 回顾笔记：离开输入框自动保存，刷新后还在
await run("回顾笔记", { path: "/review" }, async (page) => {
  await page.getByLabel("做得好的").fill("探针写下的复盘")
  await page.getByLabel("下周只做").click()
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(400)
  check("回顾笔记：刷新后还在", (await page.getByLabel("做得好的").inputValue()) === "探针写下的复盘")
})

// 13. 本地版：第一次打开弹说明，关掉后刷新不再弹；右上角 GitHub 图标指向仓库
await run("本地版说明", { showLocalNotice: true }, async (page) => {
  const title = page.getByRole("heading", { name: "你在用本地版" })
  check("本地版：第一次打开弹出说明", await title.isVisible())
  await page.getByRole("button", { name: "知道了" }).click()
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  check("本地版：关掉后刷新不再弹", !(await title.isVisible()))
  const href = await page.getByRole("link", { name: "GitHub 仓库" }).getAttribute("href")
  check("本地版：右上角 GitHub 图标指向仓库", href === "https://github.com/evepupil/DeverDesk", href ?? "")
})

// 14. 英文界面：英文浏览器第一次打开就是英文，各页（含样例数据）看不到中文，标题和语言标记跟着变
const HAN = /[一-鿿]/
const PAGES = [
  ["/", "Today"],
  ["/week", "Week"],
  ["/tasks", "Tasks"],
  ["/projects", "Projects"],
  ["/ledger", "Ledger"],
  ["/insights", "Insights"],
  ["/review", "Review"],
  ["/routines", "Routines"],
]
for (const [path, name] of PAGES) {
  await run(`英文界面 ${path}`, { locale: "en-US", path }, async (page) => {
    const text = await page.evaluate(() => document.body.innerText)
    const han = text.split("\n").filter((line) => HAN.test(line))
    check(`英文界面：${name} 页没有中文`, han.length === 0, han.slice(0, 3).join(" | "))
    check(`英文界面：${name} 页标题和语言标记`, (await page.title()) === `${name} · DeverDesk` && (await page.evaluate(() => document.documentElement.lang)) === "en", await page.title())
  })
}

// 15. 切换语言：从头像菜单切到英文，界面马上换成英文，刷新后还是英文
await run("切换语言", {}, async (page) => {
  await page.getByRole("button", { name: /^账户/ }).click()
  await page.getByRole("menuitem", { name: "语言" }).click()
  await page.getByRole("menuitemradio", { name: "English" }).click()
  await page.getByRole("heading", { name: "Today", exact: true }).waitFor({ timeout: 5_000 })
  check("切换语言：菜单切到英文后马上生效", true)
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(400)
  check("切换语言：刷新后还是英文", await page.getByRole("heading", { name: "Today", exact: true }).isVisible())
})

console.log(results.join("\n"))
console.log(`\n${results.filter((line) => line.startsWith("PASS")).length}/${results.length} 通过`)
await browser.close()
