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

// 16. 副业里程碑：能改名改日期（回车保存、Esc 取消、写错就地提示）、能删（带撤销），刷新后保持
const dayFromToday = (offset) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const pad = (value) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
await run("副业里程碑", { path: "/projects" }, async (page) => {
  const openSheet = async () => {
    await page.getByRole("button", { name: "技术博客", exact: true }).first().click()
    await page.getByRole("dialog").waitFor()
  }
  await openSheet()
  const sheet = page.getByRole("dialog")
  const section = sheet.locator("section", { has: page.getByRole("heading", { name: "里程碑" }) })
  const rows = section.getByRole("checkbox")
  const editor = section.locator("form[data-milestone-editor]")
  const titles = async () => (await rows.allTextContents()).map((text) => text.trim())
  const openEditor = async (title) => {
    await section.getByRole("button", { name: `「${title}」的操作` }).click()
    await page.getByRole("menuitem", { name: "编辑" }).click()
    await editor.waitFor()
  }

  check("里程碑：详情里列出 3 条", (await rows.count()) === 3, (await titles()).join(" | "))

  // 改名和日期：编辑框带着原来的内容并聚焦，回车保存后按日期重新排序
  await openEditor("英文版上线")
  const titleInput = editor.getByLabel("里程碑名称")
  check("里程碑：编辑框带着原标题", (await titleInput.inputValue()) === "英文版上线")
  check("里程碑：编辑框打开就聚焦在标题上", await titleInput.evaluate((element) => element === document.activeElement))
  await titleInput.fill("英文版上线 v2")
  await editor.getByLabel("目标日期").fill(dayFromToday(-100))
  await page.keyboard.press("Enter")
  await editor.waitFor({ state: "detached" })
  const renamed = await titles()
  check("里程碑：回车保存后新标题出现", renamed.some((text) => text.includes("英文版上线 v2")), renamed.join(" | "))
  check("里程碑：旧标题不再出现", !renamed.some((text) => text.includes("英文版上线") && !text.includes("v2")))
  check("里程碑：日期提前后排到中间", renamed[1]?.includes("英文版上线 v2") === true, renamed.join(" | "))

  // Esc 只取消编辑，不关侧栏，也不保存
  await openEditor("英文版上线 v2")
  await titleInput.fill("不会保存的名字")
  await page.keyboard.press("Escape")
  await editor.waitFor({ state: "detached" })
  check("里程碑：Esc 取消编辑后侧栏还开着", await sheet.isVisible())
  check("里程碑：Esc 取消后内容没变", (await titles()).some((text) => text.includes("英文版上线 v2")) && !(await titles()).some((text) => text.includes("不会保存")))
  check("里程碑：取消后焦点回到这一行的菜单按钮", await section.getByRole("button", { name: "「英文版上线 v2」的操作" }).evaluate((element) => element === document.activeElement))

  // 写错就地提示：标题空、标题太长、日期没选
  await openEditor("英文版上线 v2")
  await titleInput.fill("")
  await page.keyboard.press("Enter")
  check("里程碑：标题为空时就地提示", (await section.getByRole("alert").textContent())?.includes("请填写里程碑") === true)
  check("里程碑：提示时编辑框保持打开", (await editor.count()) === 1)
  await titleInput.fill("长".repeat(41))
  await page.keyboard.press("Enter")
  check("里程碑：标题超过 40 个字时提示", (await section.getByRole("alert").textContent())?.includes("40") === true)
  await titleInput.fill("英文版上线 v2")
  await editor.getByLabel("目标日期").fill("")
  await page.keyboard.press("Enter")
  check("里程碑：日期没选时提示", (await section.getByRole("alert").textContent())?.includes("请选择日期") === true)
  check("里程碑：只有日期框标红，标题框不标红", (await editor.getByLabel("目标日期").getAttribute("aria-invalid")) === "true" && (await titleInput.getAttribute("aria-invalid")) === null)
  await page.keyboard.press("Escape")
  await editor.waitFor({ state: "detached" })

  // 删除：马上消失，弹出的提示里点「撤销」放回原位
  const before = await titles()
  await section.getByRole("button", { name: "「英文版上线 v2」的操作" }).click()
  await page.getByRole("menuitem", { name: "删除" }).click()
  await page.getByText("已删除里程碑").waitFor()
  check("里程碑：删除后这一条消失", (await rows.count()) === 2 && !(await titles()).some((text) => text.includes("英文版上线 v2")))
  await page.getByRole("button", { name: "撤销" }).first().click()
  await page.waitForTimeout(200)
  check("里程碑：点撤销后原样放回原位", JSON.stringify(await titles()) === JSON.stringify(before), (await titles()).join(" | "))
  check("里程碑：点提示条上的撤销不会把侧栏关掉", await sheet.isVisible())

  // 勾选照常：点一下完成，再点一下取消
  const target = rows.filter({ hasText: "英文版上线 v2" })
  await target.click()
  check("里程碑：点整行仍然能勾选完成", (await target.getAttribute("aria-checked")) === "true")
  await target.click()
  check("里程碑：再点一下取消完成", (await target.getAttribute("aria-checked")) === "false")

  // 改完刷新还在（存到了本机）；详情侧栏开着的状态记在地址里，刷新后会自己再打开
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(400)
  await page.getByRole("dialog").waitFor()
  check("里程碑：刷新后改过的标题还在", (await rows.filter({ hasText: "英文版上线 v2" }).count()) === 1)
})

// 17. 侧栏开着时删任务：提示条上的「撤销」点得到（侧栏会让页面其余部分不接收点击，提示条要单独放开），点完侧栏还开着、任务回来
await run("侧栏里撤销删除", { path: "/tasks" }, async (page) => {
  await page.getByRole("button", { name: "预约体检", exact: true }).first().click()
  const sheet = page.getByRole("dialog")
  await sheet.waitFor()
  await sheet.getByRole("button", { name: /的操作/ }).click()
  await page.getByRole("menuitem", { name: "删除" }).click()
  await page.getByText(/已删除 T-/).waitFor()
  check("侧栏里撤销删除：删掉后侧栏显示已删除", (await sheet.getByText("这个任务已经删除").count()) > 0)
  await page.getByRole("button", { name: "撤销" }).first().click()
  await page.waitForTimeout(300)
  check("侧栏里撤销删除：点撤销后任务回到侧栏里", (await sheet.getByText("预约体检", { exact: true }).count()) > 0)
  check("侧栏里撤销删除：点提示条不会把侧栏关掉", await sheet.isVisible())
})

// 18. 英文界面里的里程碑：菜单、编辑框的提示、删除后的提示条都是英文
await run("英文里程碑", { locale: "en-US", path: "/projects" }, async (page) => {
  await page.getByRole("button", { name: "Developer Blog", exact: true }).first().click()
  const sheet = page.getByRole("dialog")
  await sheet.waitFor()
  const section = sheet.locator("section", { has: page.getByRole("heading", { name: "Milestones" }) })
  const menu = section.getByRole("button", { name: 'Actions for "Launch the English edition"' })
  await menu.click()
  await page.getByRole("menuitem", { name: "Edit" }).click()
  const editor = section.locator("form[data-milestone-editor]")
  await editor.getByLabel("Milestone name").fill("")
  await page.keyboard.press("Enter")
  const alert = (await section.getByRole("alert").textContent()) ?? ""
  check("英文里程碑：标题为空时的提示是英文", alert.length > 0 && !HAN.test(alert), alert)
  await page.keyboard.press("Escape")
  await menu.click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByText("Milestone deleted").waitFor()
  const han = (await page.evaluate(() => document.body.innerText)).split("\n").filter((line) => HAN.test(line))
  check("英文里程碑：编辑、删除后整个页面没有中文", han.length === 0, han.slice(0, 3).join(" | "))
})

console.log(results.join("\n"))
console.log(`\n${results.filter((line) => line.startsWith("PASS")).length}/${results.length} 通过`)
await browser.close()
