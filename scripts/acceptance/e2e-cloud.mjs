// 在线版端到端核对：本机起一个 wrangler dev（用独立的本地数据库，不碰开发数据），
// 用两个浏览器上下文模拟两台设备，核对登录、互相同步、离线补传、同时修改、访问令牌和退出登录。
// 先打包在线版再运行：pnpm build && pnpm e2e
// 访问口令读 .dev.vars 里的 DEVERDESK_PASSWORD（没有就先跑一次 pnpm dev 生成）。
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { createSession, createToken, formatExchange, isSuccessToolCall, McpClient, MCP_PROTOCOLS, postMcp, requestJson } from "./mcp-client.mjs"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))
const PORT = process.env.E2E_PORT ?? "8791"
const BASE = `http://127.0.0.1:${PORT}`
const STATE = ".wrangler/e2e-state"
const env = { ...process.env, PATH: [join(ROOT, "node_modules", ".bin"), process.env.PATH ?? ""].join(delimiter) }

const results = []
const m4Failures = []
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)

async function m4Check(name, ok, detail, page, exchanges = []) {
  check(name, ok, detail)
  if (ok) return
  const index = m4Failures.length + 1
  const fileName = `e2e-m4-${String(index).padStart(2, "0")}.png`
  const relativePath = `scripts/acceptance/.shots/${fileName}`
  const absolutePath = join(ROOT, relativePath)
  mkdirSync(join(ROOT, "scripts", "acceptance", ".shots"), { recursive: true })
  let screenshot = relativePath
  try {
    await page.screenshot({ path: absolutePath })
  } catch (error) {
    screenshot = `${relativePath} (截图失败: ${error instanceof Error ? error.message : String(error)})`
  }
  m4Failures.push({
    name,
    detail,
    screenshot,
    exchanges: exchanges.filter(Boolean).map(formatExchange),
  })
}

async function waitUntil(page, predicate, timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await page.waitForTimeout(100)
  }
  return Boolean(await predicate())
}

function toolNames(exchange) {
  return exchange?.data?.result?.tools?.map((tool) => tool.name) ?? []
}

const toolResult = (call) => call?.structuredContent ?? {}

function readPassword() {
  const file = join(ROOT, ".dev.vars")
  if (!existsSync(file)) throw new Error("没有 .dev.vars，先运行一次 pnpm dev 生成")
  const match = readFileSync(file, "utf8").match(/^DEVERDESK_PASSWORD=(.*)$/m)
  if (!match || !match[1].trim()) throw new Error(".dev.vars 里没有 DEVERDESK_PASSWORD")
  return match[1].trim()
}

function today() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
  else child.kill("SIGTERM")
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${BASE}/api/session`)
      if (response.ok) return
    } catch {
      // 还没起来
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("wrangler dev 没有起来")
}

const password = readPassword()
if (!existsSync(join(ROOT, "out", "index.html"))) throw new Error("先打包在线版：pnpm build")

rmSync(join(ROOT, STATE), { recursive: true, force: true })
const migrate = spawnSync(`wrangler d1 migrations apply DB --local --persist-to ${STATE}`, { cwd: ROOT, env, shell: true, encoding: "utf8" })
if (migrate.status !== 0) throw new Error(`数据库迁移失败：${migrate.stderr || migrate.stdout}`)

const worker = spawn(`wrangler dev --port ${PORT} --persist-to ${STATE}`, { cwd: ROOT, env, shell: true, stdio: "ignore" })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const errors = []
const devices = []

async function device(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" })
  const page = await context.newPage()
  page.on("pageerror", (error) => errors.push(`${name}：${error.message}`))
  devices.push([name, page])
  return { context, page }
}

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  await page.getByLabel("访问口令").fill(password)
  await page.getByRole("button", { name: "登录" }).click()
  await page.getByRole("heading", { name: "今天", exact: true }).waitFor({ timeout: 15_000 })
}

/** 点同步图标立刻同步，等到「已同步」 */
async function syncAndWait(page) {
  const indicator = page.locator("header button[aria-label*='同步']").first()
  await indicator.waitFor({ timeout: 15_000 })
  await indicator.click()
  await page.getByRole("button", { name: "已同步" }).waitFor({ timeout: 15_000 })
  await page.waitForTimeout(300)
}

async function quickAdd(page, text) {
  await page.getByLabel("快速添加任务").first().fill(text)
  await page.keyboard.press("Enter")
  await page.waitForTimeout(1200)
}

const taskButton = (page, title) => page.getByRole("button", { name: title, exact: true })

try {
  await waitForServer()
  const a = await device("设备甲")
  const b = await device("设备乙")

  // 1. 没登录先看到登录页，口令不对有提示，对了进工作台
  await a.page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  check("登录：没登录时显示登录页", await a.page.getByLabel("访问口令").isVisible())
  await a.page.getByLabel("访问口令").fill("wrong-password")
  await a.page.getByRole("button", { name: "登录" }).click()
  await a.page.getByText("口令不对").waitFor({ timeout: 10_000 })
  check("登录：口令不对就地提示", true)
  await login(a.page)
  check("登录：口令对了进入工作台", await a.page.getByRole("heading", { name: "今天", exact: true }).isVisible())
  await syncAndWait(a.page)

  // 2. 甲新建，乙看得到
  await quickAdd(a.page, "端到端：设备甲的任务 30m")
  await syncAndWait(a.page)
  await login(b.page)
  await syncAndWait(b.page)
  check("同步：甲新建的任务乙看得到", await taskButton(b.page, "端到端：设备甲的任务").isVisible())

  // 3. 乙勾完成，甲同步后侧栏「今天」变成 1/1
  await b.page.getByRole("button", { name: "完成「端到端：设备甲的任务」" }).click()
  await syncAndWait(b.page)
  await syncAndWait(a.page)
  const todayCount = await a.page.locator("nav[aria-label='主导航'] a", { hasText: "今天" }).first().locator("span.tabular").textContent()
  check("同步：乙勾完成后甲同步到", todayCount?.trim() === "1/1", `侧栏今天 ${todayCount}`)

  // 4. 甲离线记一件，联网后补传，乙看得到
  await a.context.setOffline(true)
  await quickAdd(a.page, "端到端：离线时记的 15m")
  await a.page.locator("header button[aria-label^='离线']").first().waitFor({ timeout: 15_000 })
  const offlineLabel = await a.page.locator("header button[aria-label^='离线']").first().getAttribute("aria-label")
  check("离线：显示离线和待上传条数", Boolean(offlineLabel?.includes("1 条")), offlineLabel ?? "")
  await a.context.setOffline(false)
  await a.page.getByRole("button", { name: "已同步" }).waitFor({ timeout: 20_000 })
  await syncAndWait(b.page)
  check("离线：联网后自动补传，乙看得到", await taskButton(b.page, "端到端：离线时记的").isVisible())

  // 5. 同时修改同一件：甲离线先改，乙后改并先同步；甲联网后以乙（后改的）为准
  // 改完关掉详情侧栏：编辑弹窗关闭动画没结束时按 Esc 会被弹窗吃掉，所以等它消失后点侧栏的关闭按钮
  const rename = async (page, from, to) => {
    await taskButton(page, from).first().click()
    await page.getByRole("button", { name: "编辑" }).click()
    const title = page.getByLabel("任务", { exact: true })
    await title.fill(to)
    await page.getByRole("button", { name: "保存" }).click()
    await title.waitFor({ state: "hidden" })
    await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click()
    await page.waitForFunction(() => document.querySelector("[role='dialog']") === null)
  }
  await a.context.setOffline(true)
  await rename(a.page, "端到端：离线时记的", "端到端：甲先改的")
  await a.page.waitForTimeout(1500)
  await rename(b.page, "端到端：离线时记的", "端到端：乙后改的")
  await syncAndWait(b.page)
  await a.context.setOffline(false)
  await a.page.getByRole("button", { name: "已同步" }).waitFor({ timeout: 20_000 })
  await syncAndWait(a.page)
  check("冲突：甲以后改的为准", await taskButton(a.page, "端到端：乙后改的").isVisible())
  check("冲突：甲先改的内容不再显示", !(await taskButton(a.page, "端到端：甲先改的").isVisible()))

  // 6. 用访问令牌通过接口建任务（以后的 AI 助手就这样用），乙同步后看得到
  const session = await createSession(BASE, password)
  const cookie = session.cookie
  const created = await createToken(BASE, cookie, { name: "端到端", tier: "write" })
  const token = created.token
  const apiTask = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "端到端：AI 助手建的任务", plannedFor: today(), estimateMin: 20 }),
  })
  check("接口：用令牌建任务成功", apiTask.ok, String(apiTask.status))
  await syncAndWait(b.page)
  check("接口：乙同步后看得到接口建的任务", await taskButton(b.page, "端到端：AI 助手建的任务").isVisible())

  // 7. 断网时退出登录被拦下（登录凭证只有服务器能清），还留在工作台
  await a.context.setOffline(true)
  await a.page.getByRole("button", { name: /^账户/ }).click()
  await a.page.getByRole("menuitem", { name: "退出登录" }).click()
  await a.page.getByText("连不上服务器，联网后再退出").waitFor({ timeout: 10_000 })
  // 菜单关闭动画结束前，页面其余部分对读屏是隐藏的，等标题重新可见再判断
  await a.page.getByRole("heading", { name: "今天", exact: true }).waitFor({ timeout: 5_000 })
  check("退出：断网时拦下并提示", !(await a.page.getByLabel("访问口令").isVisible()))
  await a.context.setOffline(false)

  // 8. 甲退出登录：回到登录页，这台设备上的缓存清掉
  await a.page.getByRole("button", { name: /^账户/ }).click()
  await a.page.getByRole("menuitem", { name: "退出登录" }).click()
  await a.page.getByLabel("访问口令").waitFor({ timeout: 15_000 })
  const cache = await a.page.evaluate(() => window.localStorage.getItem("deverdesk:cloud-cache"))
  check("退出：回到登录页并清掉本机缓存", cache === null)

  // 9. M4 MCP、权限边界和 AI 改动记录
  await login(a.page)
  await syncAndWait(a.page)

  const readToken = await createToken(BASE, cookie, { name: "M4 e2e read", tier: "read" })
  const proposeToken = await createToken(BASE, cookie, { name: "M4 e2e propose", tier: "propose" })
  const writeToken = await createToken(BASE, cookie, { name: "M4 e2e write", tier: "write" })
  const tokenCreationExchanges = [readToken.exchange, proposeToken.exchange, writeToken.exchange]
  const tokensHaveExpectedTiers = tokenCreationExchanges.every((exchange) => exchange.status === 201) &&
    readToken.tier === "read" && proposeToken.tier === "propose" && writeToken.tier === "write" &&
    [readToken.token, proposeToken.token, writeToken.token].every(Boolean)
  await m4Check(
    "MCP 1：口令会话创建 read、propose、write 令牌并返回正确权限",
    tokensHaveExpectedTiers,
    `HTTP ${tokenCreationExchanges.map((exchange) => exchange.status).join("/")}，tier ${readToken.tier}/${proposeToken.tier}/${writeToken.tier}`,
    a.page,
    tokenCreationExchanges,
  )

  const unauthenticatedMcp = await postMcp(BASE, {
    method: "initialize",
    params: { protocolVersion: MCP_PROTOCOLS.LEGACY_PROTOCOL, capabilities: {}, clientInfo: { name: "acceptance", version: "1" } },
  })
  const cookieOnlyMcp = await postMcp(BASE, {
    cookie,
    method: "initialize",
    params: { protocolVersion: MCP_PROTOCOLS.LEGACY_PROTOCOL, capabilities: {}, clientInfo: { name: "acceptance", version: "1" } },
  })
  const mcpAuthenticationWorks = [unauthenticatedMcp, cookieOnlyMcp].every((exchange) =>
    exchange.status === 401 && exchange.responseHeaders.wwwAuthenticate?.includes("Bearer"),
  )
  await m4Check(
    "MCP 2：/mcp 拒绝无令牌和仅有登录 Cookie 的请求",
    mcpAuthenticationWorks,
    `无凭证 HTTP ${unauthenticatedMcp.status}，仅 Cookie HTTP ${cookieOnlyMcp.status}`,
    a.page,
    [unauthenticatedMcp, cookieOnlyMcp],
  )

  const legacyReadClient = new McpClient(BASE, readToken.token, {
    protocolVersion: MCP_PROTOCOLS.LEGACY_PROTOCOL,
    modern: false,
  })
  const legacyInitialize = await legacyReadClient.initialize()
  const legacyInitialized = await legacyReadClient.initialized()
  const readClient = new McpClient(BASE, readToken.token)
  const readTools = await readClient.listTools()
  const readNames = toolNames(readTools)
  const readWriteRejection = await readClient.callTool("add_tasks", { tasks: [{ title: "M4 forbidden read write" }] })
  const proposeClient = new McpClient(BASE, proposeToken.token)
  const proposeTools = await proposeClient.listTools()
  const proposeNames = toolNames(proposeTools)
  const expectedReadNames = ["get_day", "get_week", "list_projects", "get_project", "get_stats", "get_week_review", "search", "query_records"]
  const legacyInstructions = legacyInitialize.data?.result?.instructions
  const legacyBehaviorWorks = legacyInitialize.status === 200 &&
    typeof legacyInstructions === "string" && legacyInstructions.length > 0 &&
    legacyInitialized.status === 202 && readTools.status === 200 &&
    expectedReadNames.every((name) => readNames.includes(name)) && readNames.length === expectedReadNames.length &&
    readWriteRejection.exchange.status === 200 && (readWriteRejection.isError || Boolean(readWriteRejection.exchange.data?.error)) &&
    proposeTools.status === 200 && proposeNames.length === 22 && proposeNames.includes("add_tasks") &&
    readNames.includes("get_day") && !readNames.includes("add_tasks")
  await m4Check(
    "MCP 3：旧协议握手返回使用说明，read 仅有 8 个只读工具且 propose 可用写工具",
    legacyBehaviorWorks,
    `旧版初始化 HTTP ${legacyInitialize.status}，initialized HTTP ${legacyInitialized.status}；read 工具 ${readNames.length}/8、缓存写工具拒绝=${readWriteRejection.isError || Boolean(readWriteRejection.exchange.data?.error)}；propose 工具 ${proposeNames.length}/22`,
    a.page,
    [legacyInitialize, legacyInitialized, readTools, readWriteRejection.exchange, proposeTools],
  )

  const writeClient = new McpClient(BASE, writeToken.token)
  let profileTimeZone = ""
  let profileTimeZoneError = ""
  try {
    await a.page.getByLabel("调整每天的可用时间").click()
    const profileTimeZoneSelect = a.page.locator("#profile-time-zone")
    await profileTimeZoneSelect.waitFor({ timeout: 8_000 })
    profileTimeZone = (await profileTimeZoneSelect.textContent()) ?? ""
    await a.page.getByRole("dialog").getByRole("button", { name: "取消" }).click()
  } catch (error) {
    profileTimeZoneError = error instanceof Error ? error.message.split("\n")[0] : String(error)
    await a.page.keyboard.press("Escape").catch(() => {})
  }
  const writeTools = await writeClient.listTools()
  const dayCall = await writeClient.callTool("get_day", {})
  const dayData = toolResult(dayCall)
  const writeNames = toolNames(writeTools)
  const dayMatchesLocalTime = profileTimeZone.includes(dayData.timeZone ?? "") &&
    dayData.timeZone === "Asia/Shanghai" && dayData.timeZoneKnown === true && dayData.today === true
  const writeToolsAndTimezoneWork = writeTools.status === 200 && writeNames.length === 22 &&
    writeNames.includes("get_day") && isSuccessToolCall(dayCall) && dayMatchesLocalTime
  await m4Check(
    "MCP 4：write 令牌列出 22 个工具，get_day 日期和时区匹配设备甲资料",
    writeToolsAndTimezoneWork,
    `工具数 ${writeNames.length}；页面时区 ${profileTimeZone.trim() || "未显示"}；get_day ${dayData.date ?? "无日期"} / ${dayData.timeZone ?? "无时区"} (known=${dayData.timeZoneKnown})${profileTimeZoneError ? `；资料读取错误 ${profileTimeZoneError}` : ""}`,
    a.page,
    [writeTools, dayCall.exchange],
  )

  const taskTitles = ["M4 E2E MCP task alpha", "M4 E2E MCP task beta"]
  const addTasksCall = await writeClient.callTool("add_tasks", {
    tasks: taskTitles.map((title) => ({ title, plannedFor: dayData.date, estimateMin: 25 })),
    reason: "M4 E2E direct MCP task creation",
  })
  const addedTasks = toolResult(addTasksCall).tasks ?? []
  await syncAndWait(b.page)
  const taskCardsVisible = await Promise.all(taskTitles.map(async (title) => {
    const titleButton = taskButton(b.page, title)
    if (!(await titleButton.isVisible())) return false
    return (await titleButton.locator("xpath=../..").getByRole("img", { name: "AI 记录" }).count()) === 1
  }))
  const aiTaskCreationWorks = isSuccessToolCall(addTasksCall) &&
    toolResult(addTasksCall).changeset?.status === "applied" && addedTasks.length === 2 &&
    addedTasks.every((task) => task.id && task.code && task.byAi === true) && taskCardsVisible.every(Boolean)
  await m4Check(
    "MCP 5：直接创建的两个任务同步到设备乙今天页并显示 AI 标记",
    aiTaskCreationWorks,
    `changeset ${toolResult(addTasksCall).changeset?.status ?? "无"}；返回任务均有编号和 byAi 标记；卡片可见且有 AI 标记 ${taskCardsVisible.filter(Boolean).length}/2`,
    b.page,
    [addTasksCall.exchange],
  )

  const proposalNote = "M4 E2E proposal income"
  const proposalReason = "M4 E2E proposal for user acceptance"
  const proposalCall = await new McpClient(BASE, proposeToken.token).callTool("add_ledger_entries", {
    entries: [{ kind: "income", amount: 7389.21, date: dayData.date, note: proposalNote }],
    reason: proposalReason,
  })
  const proposalId = toolResult(proposalCall).changeset?.id
  let proposalShown = false
  let proposalAccepted = false
  let ledgerEntryVisible = false
  let ledgerEntryAiMarked = false
  let pendingBadgeGone = false
  let proposalUiError = ""
  try {
    await a.page.goto(`${BASE}/`, { waitUntil: "networkidle" })
    await a.page.getByRole("heading", { name: "今天", exact: true }).waitFor({ timeout: 10_000 })
    const acceptButton = a.page.getByRole("button", { name: "采纳", exact: true }).first()
    proposalShown = await waitUntil(a.page, () => acceptButton.isVisible())
    if (proposalShown) {
      await acceptButton.click()
      proposalAccepted = await waitUntil(a.page, async () => (await a.page.getByRole("button", { name: "采纳", exact: true }).count()) === 0)
      const activityButton = a.page.getByRole("button", { name: "AI 动态" })
      pendingBadgeGone = await waitUntil(a.page, async () => (await activityButton.locator("span").count()) === 0)
      await a.page.goto(`${BASE}/ledger/`, { waitUntil: "networkidle" })
      const ledgerNote = a.page.getByText(proposalNote, { exact: true })
      ledgerEntryVisible = await waitUntil(a.page, () => ledgerNote.isVisible())
      if (ledgerEntryVisible) {
        ledgerEntryAiMarked = (await ledgerNote.locator("xpath=..").getByRole("img", { name: "AI 记录" }).count()) === 1
      }
    }
  } catch (error) {
    proposalUiError = error instanceof Error ? error.message.split("\n")[0] : String(error)
  }
  const proposalFlowWorks = isSuccessToolCall(proposalCall) &&
    toolResult(proposalCall).changeset?.status === "proposed" && Boolean(proposalId) &&
    proposalShown && proposalAccepted && ledgerEntryVisible && ledgerEntryAiMarked && pendingBadgeGone
  await m4Check(
    "MCP 6：propose 收支在设备甲显示提议，采纳后出现在收支页且待处理徽标消失",
    proposalFlowWorks,
    `changeset ${toolResult(proposalCall).changeset?.status ?? "无"}；提议 ${proposalShown}、采纳 ${proposalAccepted}、收支记录 ${ledgerEntryVisible} 且有 AI 标记 ${ledgerEntryAiMarked}、徽标清除 ${pendingBadgeGone}${proposalUiError ? `；界面错误 ${proposalUiError}` : ""}`,
    a.page,
    [proposalCall.exchange],
  )

  const updateReason = "M4 E2E status update to done"
  const updateCall = addedTasks[0]?.code
    ? await writeClient.callTool("update_tasks", {
      updates: [{ task: addedTasks[0].code, status: "done" }],
      reason: updateReason,
    })
    : null
  let updateDrawerVisible = false
  let taskReturnedToTodo = false
  let undoUiError = ""
  try {
    await a.page.goto(`${BASE}/`, { waitUntil: "networkidle" })
    await a.page.getByRole("heading", { name: "今天", exact: true }).waitFor({ timeout: 10_000 })
    await syncAndWait(a.page)
    await a.page.getByRole("button", { name: "AI 动态" }).click()
    const updateCard = a.page.locator("article").filter({ hasText: updateReason }).first()
    updateDrawerVisible = await waitUntil(a.page, () => updateCard.isVisible())
    if (updateDrawerVisible) {
      const undoButton = updateCard.getByRole("button", { name: "撤销", exact: true })
      await undoButton.click()
      await waitUntil(a.page, async () => (await taskButton(a.page, taskTitles[0]).count()) > 0)
      const closeButton = a.page.getByRole("dialog").getByRole("button", { name: "关闭" })
      if (await closeButton.isVisible()) await closeButton.click()
      await a.page.goto(`${BASE}/`, { waitUntil: "networkidle" })
      await syncAndWait(a.page)
      const completeButton = a.page.getByRole("button", { name: `完成「${taskTitles[0]}」` })
      taskReturnedToTodo = await completeButton.isVisible()
    }
  } catch (error) {
    undoUiError = error instanceof Error ? error.message.split("\n")[0] : String(error)
  }
  const undoFlowWorks = Boolean(updateCall) && isSuccessToolCall(updateCall) &&
    toolResult(updateCall).changeset?.status === "applied" && updateDrawerVisible && taskReturnedToTodo
  await m4Check(
    "MCP 7：设备甲在 AI 动态撤销任务状态变更，同步后任务恢复未完成",
    undoFlowWorks,
    `changeset ${toolResult(updateCall).changeset?.status ?? "无"}；动态记录 ${updateDrawerVisible}；恢复待办 ${taskReturnedToTodo}${undoUiError ? `；界面错误 ${undoUiError}` : ""}`,
    a.page,
    [updateCall?.exchange],
  )

  const deleteReason = "M4 E2E task deletion preview"
  const deletePreviewCall = addedTasks[1]?.id
    ? await writeClient.callTool("delete_records", {
      items: [{ kind: "task", id: addedTasks[1].id }],
      reason: deleteReason,
    })
    : null
  const previewData = toolResult(deletePreviewCall)
  const previewCreated = Boolean(deletePreviewCall) && isSuccessToolCall(deletePreviewCall) && previewData.changeset?.status === "preview"
  const secondTaskVisibleBeforeConfirm = addedTasks[1]?.title
    ? await taskButton(b.page, addedTasks[1].title).isVisible()
    : false
  const confirmCall = previewCreated
    ? await writeClient.callTool("manage_changes", { action: "confirm", changesetId: previewData.changeset.id })
    : null
  if (confirmCall) await syncAndWait(b.page)
  const secondTaskGoneAfterConfirm = Boolean(addedTasks[1]?.title) && !(await taskButton(b.page, addedTasks[1].title).isVisible())
  const deleteFlowWorks = previewCreated && secondTaskVisibleBeforeConfirm &&
    isSuccessToolCall(confirmCall) && toolResult(confirmCall).status === "applied" && secondTaskGoneAfterConfirm
  await m4Check(
    "MCP 8：删除先返回预览且数据未变，确认后设备乙同步看不到任务",
    deleteFlowWorks,
    `预览 ${previewData.changeset?.status ?? "无"}；确认前可见 ${secondTaskVisibleBeforeConfirm}；确认后 ${toolResult(confirmCall).status ?? "无状态"}，任务消失 ${secondTaskGoneAfterConfirm}`,
    b.page,
    [deletePreviewCall?.exchange, confirmCall?.exchange],
  )

  const boundaryTask = { title: "M4 permission boundary task", estimateMin: 20 }
  const permissionExchanges = []
  const permissionRequests = []
  for (const [tier, credential] of [["read", readToken.token], ["propose", proposeToken.token]]) {
    for (const [path, method, body] of [
      ["/api/sync", "POST", { changes: [] }],
      ["/api/tasks", "POST", boundaryTask],
    ]) {
      const exchange = await requestJson(BASE, path, { method, token: credential, body })
      permissionExchanges.push(exchange)
      permissionRequests.push({ tier, path, status: exchange.status })
    }
  }
  const writeSyncExchange = await requestJson(BASE, "/api/sync", { method: "POST", token: writeToken.token, body: { changes: [] } })
  const writeTaskExchange = await requestJson(BASE, "/api/tasks", { method: "POST", token: writeToken.token, body: boundaryTask })
  permissionExchanges.push(writeSyncExchange, writeTaskExchange)
  permissionRequests.push({ tier: "write", path: "/api/sync", status: writeSyncExchange.status })
  permissionRequests.push({ tier: "write", path: "/api/tasks", status: writeTaskExchange.status })

  const aiApiExchanges = []
  const aiApiStatuses = []
  for (const [tier, credential] of [["read", readToken.token], ["propose", proposeToken.token], ["write", writeToken.token]]) {
    const requests = [
      ["GET", "/api/ai/changesets?status=pending&limit=20", undefined],
      ["POST", `/api/ai/changesets/${encodeURIComponent(proposalId ?? "missing")}/accept`, undefined],
      ["POST", `/api/ai/changesets/${encodeURIComponent(previewData.changeset?.id ?? "missing")}/undo`, { seqs: [] }],
    ]
    for (const [method, path, body] of requests) {
      const exchange = await requestJson(BASE, path, { method, token: credential, body })
      aiApiExchanges.push(exchange)
      aiApiStatuses.push({ tier, path, status: exchange.status })
    }
  }
  const permissionBoundariesWork = permissionRequests.filter(({ tier }) => tier === "read" || tier === "propose")
    .every(({ status }) => status === 403) &&
    writeSyncExchange.status === 200 && writeTaskExchange.status === 201 &&
    aiApiStatuses.length === 9 && aiApiStatuses.every(({ status }) => status === 403)
  await m4Check(
    "MCP 9：令牌按 tier 隔离同步/直写，所有 tier 均不能调用 session-only AI API",
    permissionBoundariesWork,
    `低权限 sync/task ${permissionRequests.slice(0, 4).map(({ status }) => status).join("/")}；write sync/task ${writeSyncExchange.status}/${writeTaskExchange.status}；AI list/accept/undo 九次请求状态 ${aiApiStatuses.map(({ status }) => status).join("/")}`,
    a.page,
    [...permissionExchanges, ...aiApiExchanges],
  )

  const invalidTitleCall = await writeClient.callTool("add_tasks", { tasks: [{ title: "" }] })
  const missingTaskCall = await writeClient.callTool("update_tasks", {
    updates: [{ task: "T-99999999", status: "done" }],
  })
  const invalidInputsRejected = invalidTitleCall.isError &&
    Boolean(invalidTitleCall.text.trim()) && /title|invalid|required|empty/i.test(invalidTitleCall.text) &&
    missingTaskCall.isError && /not found/i.test(missingTaskCall.text)
  await m4Check(
    "MCP 10：空任务标题和不存在的任务引用均以 isError 返回原因",
    invalidInputsRejected,
    `空标题 isError=${invalidTitleCall.isError}，响应 ${invalidTitleCall.text || JSON.stringify(invalidTitleCall.exchange.data?.error ?? "无文本")}；不存在任务 isError=${missingTaskCall.isError}，响应 ${missingTaskCall.text || JSON.stringify(missingTaskCall.exchange.data?.error ?? "无文本")}`,
    a.page,
    [invalidTitleCall.exchange, missingTaskCall.exchange],
  )

  check("整个过程没有页面报错", errors.length === 0, errors.join(" | "))
} catch (error) {
  check("端到端流程", false, error instanceof Error ? error.message.split("\n")[0] : String(error))
  // 出错时把两台设备的样子截下来，方便定位
  for (const [name, page] of devices) {
    await page.screenshot({ path: `scripts/acceptance/.shots/e2e-失败-${name}.png` }).catch(() => {})
  }
} finally {
  await browser.close()
  killTree(worker)
}

console.log(results.join("\n"))
console.log(`\n${results.filter((line) => line.startsWith("PASS")).length}/${results.length} 通过`)
if (m4Failures.length > 0) {
  console.log("\nM4 功能失败证据")
  for (const failure of m4Failures) {
    console.log(`\n${failure.name}\n实际结果: ${failure.detail}\n${failure.exchanges.map((exchange, index) => `请求/响应 ${index + 1}:\n${exchange}`).join("\n")}\n截图: ${failure.screenshot}`)
  }
}
if (results.some((line) => line.startsWith("FAIL"))) process.exitCode = 1
