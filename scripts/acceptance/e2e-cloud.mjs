// 在线版端到端核对：本机起一个 wrangler dev（用独立的本地数据库，不碰开发数据），
// 用两个浏览器上下文模拟两台设备，核对登录、互相同步、离线补传、同时修改、访问令牌和退出登录。
// 先打包在线版再运行：pnpm build && pnpm e2e
// 访问口令读 .dev.vars 里的 DEVERDESK_PASSWORD（没有就先跑一次 pnpm dev 生成）。
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))
const PORT = process.env.E2E_PORT ?? "8791"
const BASE = `http://127.0.0.1:${PORT}`
const STATE = ".wrangler/e2e-state"
const env = { ...process.env, PATH: [join(ROOT, "node_modules", ".bin"), process.env.PATH ?? ""].join(delimiter) }

const results = []
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)

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
  const session = await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })
  const cookie = session.headers.get("set-cookie")?.split(";")[0] ?? ""
  const created = await fetch(`${BASE}/api/tokens`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ name: "端到端" }) })
  const { token } = await created.json()
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
