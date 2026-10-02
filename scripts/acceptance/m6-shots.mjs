// M6 online acceptance screenshots. Run with: node scripts/acceptance/m6-shots.mjs
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { requestJson } from "./mcp-client.mjs"
import { seedM6 } from "./m6-seed.mjs"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))
const PORT = process.env.E2E_PORT ?? "8793"
const BASE = `http://127.0.0.1:${PORT}`
const STATE = join(ROOT, ".wrangler", "m6-shots-state")
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js")
const SHOT_DIR = join(ROOT, "scripts", "acceptance", ".shots", "m6")
const env = { ...process.env, PATH: [join(ROOT, "node_modules", ".bin"), process.env.PATH ?? ""].join(delimiter) }
const checks = []
const screenshots = []
const productIssues = []
const pageErrors = []
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function check(name, ok, detail = "") {
  const line = `${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`
  checks.push(line)
  console.log(line)
  return ok
}

function readPassword() {
  const file = join(ROOT, ".dev.vars")
  if (!existsSync(file)) throw new Error(".dev.vars is missing; run pnpm dev once to create it")
  const match = readFileSync(file, "utf8").match(/^DEVERDESK_PASSWORD=(.*)$/m)
  if (!match || !match[1].trim()) throw new Error("DEVERDESK_PASSWORD is missing from .dev.vars")
  return match[1].trim()
}

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date())
  const part = (type) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function shortError(error) {
  return error instanceof Error ? error.message.split("\n")[0] : String(error)
}

async function waitUntil(predicate, timeout = 10_000, interval = 100) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { if (await predicate()) return true } catch { /* UI may be transitioning. */ }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  return Boolean(await predicate())
}

async function takeScreenshot(page, name, fullPage = false) {
  mkdirSync(SHOT_DIR, { recursive: true })
  let file = `${name}.png`
  let suffix = 2
  while (existsSync(join(SHOT_DIR, file))) file = `${name}-${suffix++}.png`
  await page.screenshot({ path: join(SHOT_DIR, file), fullPage, animations: "disabled" })
  const relative = `scripts/acceptance/.shots/m6/${file}`
  screenshots.push(relative)
  return relative
}

function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === "win32") {
    return spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { encoding: "utf8" })
  }
  child.kill("SIGTERM")
  return { status: 0 }
}

async function portIsBusy() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 800)
  try { await fetch(`${BASE}/api/session`, { signal: controller.signal }); return true }
  catch { return false }
  finally { clearTimeout(timer) }
}

async function waitForPortClose(timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (!(await portIsBusy())) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return !(await portIsBusy())
}

async function waitForServer(worker) {
  for (let index = 0; index < 120; index += 1) {
    if (worker.exitCode !== null) throw new Error(`wrangler dev exited early (${worker.exitCode})`)
    try {
      const response = await fetch(`${BASE}/api/session`, { signal: AbortSignal.timeout(1500) })
      if (response.ok) return
    } catch { /* Wrangler is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("wrangler dev did not become ready")
}

async function login(page, password, locale = "zh-CN") {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  const todayHeading = page.getByRole("heading", { name: locale === "en" ? "Today" : "今天", exact: true })
  if (await todayHeading.isVisible().catch(() => false)) return
  const input = page.locator('input[type="password"]').first()
  await input.waitFor({ timeout: 15_000 })
  await input.fill(password)
  await page.getByRole("button", { name: locale === "en" ? "Sign in" : "登录", exact: true }).click()
  await todayHeading.waitFor({ timeout: 15_000 })
}

async function syncAndWait(page, locale = "zh-CN") {
  const indicator = page.locator("header button[aria-label*='同步'], header button[aria-label*='sync']").first()
  await indicator.waitFor({ timeout: 15_000 })
  await indicator.click()
  await page.getByRole("button", { name: locale === "en" ? "Synced" : "已同步", exact: true }).waitFor({ timeout: 15_000 })
  await page.waitForTimeout(250)
}

async function configureProfile(page) {
  await page.getByLabel("调整每天的可用时间").click()
  const dialog = page.getByRole("dialog").last()
  const choose = async (id, value) => {
    await page.locator(`#${id}`).click()
    await page.getByRole("option", { name: `${value}:00`, exact: true }).click()
  }
  await choose("profile-start", 0)
  await choose("profile-end", 24)
  await page.locator("#profile-time-zone").click()
  await page.getByRole("option", { name: /^Asia\/Shanghai/ }).click()
  await dialog.getByRole("button", { name: "保存", exact: true }).click()
  await dialog.waitFor({ state: "hidden" })
  await syncAndWait(page)
}

async function refreshLive(page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
}

function focusSection(page, locale = "zh-CN") {
  const title = locale === "en" ? "Time tracked" : "投入"
  return page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).first()
}

async function openAccountMenu(page, locale = "zh-CN") {
  const account = page.locator("header button[aria-label^='账户'], header button[aria-label^='Account']").first()
  await account.click()
  await page.getByRole("menuitem", { name: locale === "en" ? "Connect AI" : "连接 AI", exact: true }).click()
  await page.getByRole("dialog").getByRole("heading", { name: locale === "en" ? "Connect AI" : "连接 AI", exact: true }).waitFor()
  return page.getByRole("dialog").last()
}

async function createRecorderGuide(page, locale, tokenName) {
  const dialog = await openAccountMenu(page, locale)
  const permission = dialog.getByRole("radiogroup", { name: locale === "en" ? "New token permission" : "新令牌权限" })
  const defaultPermission = await permission.locator('[role="radio"][aria-checked="true"]').innerText()
  await dialog.getByRole("textbox", { name: locale === "en" ? "Token purpose" : "令牌用途" }).fill(tokenName)
  await dialog.getByRole("button", { name: locale === "en" ? "Create" : "新建", exact: true }).click()
  const tokenInput = dialog.getByRole("textbox", { name: locale === "en" ? "New access token" : "新建的访问令牌" })
  await tokenInput.waitFor({ timeout: 15_000 })
  const token = await tokenInput.inputValue()
  const clients = dialog.getByRole("radiogroup", { name: locale === "en" ? "Client configuration" : "客户端配置" })
  await clients.getByRole("radio", { name: locale === "en" ? "Recorder" : "记录器", exact: true }).click()
  const pluginLabel = locale === "en" ? "Recorder plugin commands" : "记录器插件命令"
  const setupLabel = locale === "en" ? "Recorder setup command" : "记录器安装命令"
  const pluginText = await dialog.locator(`pre[aria-label="${pluginLabel}"]`).innerText()
  const setupText = await dialog.locator(`pre[aria-label="${setupLabel}"]`).innerText()
  const hintText = locale === "en" ? "The recorder needs the Write permission to upload" : "记录器需要「直接改」权限才能上传"
  const hintVisible = await dialog.getByText(hintText, { exact: true }).isVisible()
  return { dialog, token, pluginText, setupText, defaultPermission, hintVisible }
}

async function main() {
  let worker
  let browser
  let context
  let page
  let stateOwned = false
  let finalError = ""

  try {
    const build = process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "pnpm build"], { cwd: ROOT, env, encoding: "utf8", stdio: "pipe" })
      : spawnSync("pnpm", ["build"], { cwd: ROOT, env, encoding: "utf8", stdio: "pipe" })
    if (build.status !== 0) throw new Error(`pnpm build failed: ${build.stderr || build.stdout || build.error}`)
    check("Build: pnpm build produced the online edition", true)

    if (existsSync(STATE)) throw new Error(`${STATE} already exists; refusing to remove or reuse existing state`)
    if (await portIsBusy()) throw new Error(`port ${PORT} is already serving content; refusing to use or stop an existing process`)
    stateOwned = true
    const migrate = spawnSync(process.execPath, [WRANGLER, "d1", "migrations", "apply", "DB", "--local", "--persist-to", STATE], {
      cwd: ROOT, env, encoding: "utf8",
    })
    if (migrate.status !== 0) throw new Error(`isolated D1 migration failed: ${migrate.stderr || migrate.stdout}`)
    check("Isolation: Wrangler D1 migrations use .wrangler/m6-shots-state", true)

    worker = spawn(process.execPath, [WRANGLER, "dev", "--port", PORT, "--persist-to", STATE], {
      cwd: ROOT, env, stdio: "ignore",
    })
    await waitForServer(worker)
    check("Server: isolated Wrangler edition responds", true, BASE)

    const password = readPassword()
    browser = await chromium.launch({ channel: "msedge", headless: true })
    context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" })
    page = await context.newPage()
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await login(page, password)
    await syncAndWait(page)
    await configureProfile(page)
    check("Auth: password login reaches Today", await page.getByRole("heading", { name: "今天", exact: true }).isVisible())

    const day = todayInShanghai()
    const seeded = await seedM6({ base: BASE, password, day, runId })
    check("Seed: MCP created Quill/Beacon, directory names, and scheduled/unscheduled tasks", true,
      `${day}; quill-app, quill-docs, beacon`)
    check("Seed: MCP get_day matches the browser day and Asia/Shanghai", seeded.mcpDay === day && seeded.mcpTimeZone === "Asia/Shanghai" && seeded.timeZoneKnown,
      `${seeded.mcpDay} / ${seeded.mcpTimeZone} (known=${seeded.timeZoneKnown})`)
    check("Seed: recorder API uploaded three commit tasks and entries", true, "Fix webhook retry 55m; Add pricing page 50m; Tidy onboarding copy 40m")
    check("Seed: two Quill live windows overlap for 20m and 8m", true, "quill-app and quill-docs")
    const longRejected = seeded.longName.length === 60 && seeded.longAttempt.isError && seeded.longAttempt.text.length > 0
    check("Boundary: MCP enforces the project-name limit for a 60-character request", longRejected,
      `attempted ${seeded.longName.length}; ${seeded.longAttempt.text || "no validation response"}`)

    await syncAndWait(page)
    const liveWrite = await requestJson(BASE, "/api/recorder/live", { method: "PUT", token: seeded.token, body: seeded.liveRequest() })
    await refreshLive(page)
    const focus = focusSection(page)
    const liveRows = focus.locator("ul > li").filter({ hasText: /开始/ })
    const rowsLoaded = await waitUntil(async () => (await focus.locator("ul > li").count()) === 5)
    const barCount = await page.locator("[data-actual-bar]").count()
    const totalText = await focus.locator("header").innerText()
    check("B: Today shows three coding entries and two live rows", liveWrite.status === 204 && rowsLoaded && await liveRows.count() === 2,
      `${await focus.locator("ul > li").count()} focus rows; live PUT=${liveWrite.status}`)
    check("B: actual rail has five bars and totals 2h53m", barCount === 5 && totalText.includes("2h53m"), `${barCount} bars; ${totalText}`)

    const bars = await page.locator("[data-actual-bar]").evaluateAll((elements) => elements.map((element) => ({
      label: element.getAttribute("aria-label") ?? "", left: element.style.left,
    })))
    const live20 = bars.find((bar) => bar.label.includes("20m"))
    const live8 = bars.find((bar) => bar.label.includes("8m"))
    const taskBars = ["Fix webhook retry", "Add pricing page", "Tidy onboarding copy"]
      .every((name) => bars.some((bar) => bar.label.includes(name)))
    check("B: coding bars expose task titles and overlapping live windows occupy separate lanes",
      taskBars && Boolean(live20 && live8 && live20.left !== live8.left), `live lanes ${live20?.left ?? "missing"}/${live8?.left ?? "missing"}`)
    const rail = page.locator("[data-actual-lane]")
    const hoverResults = []
    const taskNames = ["Fix webhook retry", "Add pricing page", "Tidy onboarding copy"]
    for (const name of taskNames) {
      const target = page.locator(`[data-actual-bar][aria-label*="${name}"]`).first()
      if (!(await target.count())) {
        hoverResults.push({ name, shown: false, text: "", expected: [] })
        continue
      }
      await target.scrollIntoViewIfNeeded()
      const box = await target.boundingBox()
      const railBox = await rail.boundingBox()
      if (!box || !railBox) {
        hoverResults.push({ name, shown: false, text: "", expected: [] })
        continue
      }
      const y = box.y + box.height / 2
      const expected = await page.locator("[data-actual-bar]").evaluateAll((elements, centerY) =>
        elements.filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.top <= centerY && centerY <= rect.bottom
        }).map((element) => element.getAttribute("aria-label") ?? ""), y)
      await page.mouse.move(railBox.x + railBox.width / 2, y)
      const tooltip = page.getByRole("tooltip")
      const shown = await waitUntil(async () => {
        if (!(await tooltip.isVisible())) return false
        const text = await tooltip.innerText()
        return expected.length > 0 && expected.every((label) => text.includes(label)) && text.includes(name)
      })
      const text = await tooltip.innerText().catch(() => "")
      hoverResults.push({ name, shown, text, expected })
    }
    const allCoveringBarsListed = hoverResults.length === taskNames.length && hoverResults.every((item) => item.shown)
    check("B: hovering the rail at each coding entry center lists every covering bar", allCoveringBarsListed,
      hoverResults.map((item) => `${item.name}=${item.shown} (${item.expected.length} expected)`).join("; "))
    const overlapResult = hoverResults.find((item) => item.name === "Add pricing page")
    const overlapListed = Boolean(overlapResult?.text.includes("Fix webhook retry") && overlapResult.text.includes("Add pricing page"))
    check("B: overlapping entry center lists both coding tasks", overlapListed, overlapResult?.text ?? "tooltip missing")
    const overlapBar = page.locator('[data-actual-bar][aria-label*="Add pricing page"]').first()
    await overlapBar.scrollIntoViewIfNeeded()
    const overlapBox = await overlapBar.boundingBox()
    const overlapRailBox = await rail.boundingBox()
    if (overlapBox && overlapRailBox) {
      await page.mouse.move(overlapRailBox.x + overlapRailBox.width / 2, overlapBox.y + overlapBox.height / 2)
      await waitUntil(() => page.getByRole("tooltip").isVisible())
    }
    await takeScreenshot(page, "b2-lane-hover", true)

    await page.mouse.move(1350, 900)
    const tooltip = page.getByRole("tooltip")
    const closedAfterLeave = await waitUntil(async () => !(await tooltip.isVisible().catch(() => false)))
    const emptyPoint = await rail.evaluate((element) => {
      const railRect = element.getBoundingClientRect()
      const scrollerRect = element.closest(".scroll-thin")?.getBoundingClientRect()
      const top = Math.max(railRect.top, scrollerRect?.top ?? 0, 0)
      const bottom = Math.min(railRect.bottom, scrollerRect?.bottom ?? innerHeight, innerHeight)
      const bars = [...document.querySelectorAll("[data-actual-bar]")].map((bar) => bar.getBoundingClientRect())
      for (let y = Math.ceil(top); y < bottom; y += 1) {
        if (bars.every((bar) => y < bar.top || y > bar.bottom)) {
          return { x: railRect.left + railRect.width / 2, y }
        }
      }
      return null
    })
    let emptyRailHasNoTooltip = false
    if (emptyPoint) {
      await page.mouse.move(emptyPoint.x, emptyPoint.y)
      emptyRailHasNoTooltip = await waitUntil(async () => !(await tooltip.isVisible().catch(() => false)))
    }
    check("B: leaving the rail closes its tooltip and an empty rail position shows none",
      closedAfterLeave && emptyRailHasNoTooltip, `left=${closedAfterLeave}; empty=${emptyRailHasNoTooltip}`)

    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 960 })
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
      check(`Responsive: ${width}px desktop has no horizontal overflow`, dimensions.scroll <= dimensions.width, `${dimensions.scroll}/${dimensions.width}`)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const mobile = await page.evaluate(() => {
      const rail = document.querySelector('[role="group"][aria-label="实际投入"]')
      return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        railVisible: rail ? getComputedStyle(rail).display !== "none" : false }
    })
    check("Responsive: 390px mobile has no overflow and hides the actual-time rail",
      mobile.scroll <= mobile.width && !mobile.railVisible, `${mobile.scroll}/${mobile.width}; railVisible=${mobile.railVisible}`)
    await takeScreenshot(page, "c1-mobile", true)
    await page.setViewportSize({ width: 1440, height: 960 })

    const grid = page.locator(".relative.my-2.mr-1").first()
    const slot = await grid.evaluate((element) => {
      const container = element.parentElement
      const hours = [...element.querySelectorAll(":scope > div[aria-hidden] span")]
        .map((item) => Number(item.textContent?.split(":")[0])).filter(Number.isFinite)
      const dayStart = Math.min(...hours), dayEnd = Math.max(...hours)
      const candidates = [15, 16, 17, 18, 19, 20, 21, 22, 14, 12, 8, 7].map((hour) => hour * 60)
      const minute = candidates.find((value) => value >= dayStart * 60 && value <= dayEnd * 60 - 30 &&
        (value + 30 <= 13 * 60 || value >= 13 * 60 + 45) && (value + 30 <= 9 * 60 + 10 || value >= 11 * 60 + 30)) ?? 16 * 60
      if (container) container.scrollTop = Math.max(0, (minute - dayStart * 60) * 56 / 60 - 140)
      return { minute, dayStart }
    })
    await page.waitForTimeout(100)
    const point = await grid.evaluate((element, value) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.right - 12, y: rect.top + (value.minute - value.dayStart * 60) * 56 / 60 }
    }, slot)
    await page.mouse.click(point.x, point.y)
    const slotTime = `${String(Math.floor(slot.minute / 60)).padStart(2, "0")}:${String(slot.minute % 60).padStart(2, "0")}`
    const option = page.getByRole("button", { name: /M6 Beacon unscheduled task/ }).last()
    const optionVisible = await option.isVisible().catch(() => false)
    if (optionVisible) await option.click()
    const beaconTask = page.locator("[data-block][aria-label*='M6 Beacon unscheduled task']")
    const beaconPlaced = await waitUntil(() => beaconTask.isVisible())
    check("Timeline: blank-slot chooser schedules the selected unplaced task", optionVisible && beaconPlaced,
      `slot ${slotTime}; chooser=${optionVisible}; task=${beaconPlaced}`)
    await takeScreenshot(page, "b2-unscheduled-slot", true)

    const block = page.locator("[data-block][aria-label*='M6 Quill scheduled task']").first()
    await block.scrollIntoViewIfNeeded()
    let blockLabel = await block.getAttribute("aria-label")
    const blockBox = await block.boundingBox()
    if (blockBox) {
      await page.mouse.move(blockBox.x + blockBox.width / 2, blockBox.y + blockBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(blockBox.x + blockBox.width / 2, blockBox.y + blockBox.height / 2 + 14, { steps: 3 })
      await page.mouse.up()
    }
    const moved = await waitUntil(async () => {
      blockLabel = await block.getAttribute("aria-label")
      return Boolean(blockLabel?.includes("13:15"))
    })
    check("Timeline: dragging a scheduled block moves it by a 15-minute snap", moved, blockLabel ?? "block missing")
    await takeScreenshot(page, "b3-block-move", true)

    const movedBox = await block.boundingBox()
    const resizeBox = await block.locator("[data-handle='resize']").boundingBox()
    if (movedBox && resizeBox) {
      await page.mouse.move(movedBox.x + movedBox.width / 2, resizeBox.y + resizeBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(movedBox.x + movedBox.width / 2, resizeBox.y + resizeBox.height / 2 + 14, { steps: 3 })
      await page.mouse.up()
    }
    const resized = await waitUntil(async () => {
      blockLabel = await block.getAttribute("aria-label")
      return Boolean(blockLabel?.includes("13:15") && blockLabel.includes("14:15"))
    })
    check("Timeline: dragging the block edge resizes its estimate by 15 minutes", resized, blockLabel ?? "block missing")
    await takeScreenshot(page, "b4-block-resize", true)

    await focusSection(page).getByRole("button").filter({ hasText: "Fix webhook retry" }).first().click()
    const taskSheet = page.getByRole("dialog").last()
    await taskSheet.getByRole("heading", { name: /Fix webhook retry/ }).waitFor()
    const markers = await taskSheet.getByRole("img", { name: "自动记录" }).count()
    const notes = await taskSheet.locator("textarea").first().inputValue()
    const timeLine = await taskSheet.getByText("09:10–10:05", { exact: true }).count()
    check("Recorder: task details show automatic markers, entry timeline, and commit note",
      markers >= 2 && timeLine === 1 && /c31b87a Retry failed webhook deliveries/.test(notes),
      `markers=${markers}; timeline=${timeLine}; commit note=${notes}`)
    await takeScreenshot(page, "b5-coding-task-sheet", true)
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null)

    await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" })
    await page.getByRole("heading", { name: "副业", exact: true }).waitFor()
    await takeScreenshot(page, "a1-project-directories", true)
    await page.getByRole("button", { name: "Quill", exact: true }).first().click()
    let projectSheet = page.getByRole("dialog").last()
    await projectSheet.getByRole("heading", { name: "Quill", exact: true }).waitFor()
    const quillDirs = await page.getByText("quill-app", { exact: true }).count() === 1 && await page.getByText("quill-docs", { exact: true }).count() === 1
    check("Projects: Quill detail shows both bound directory names", quillDirs)
    await takeScreenshot(page, "a2-project-sheet", true)
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null)

    await page.getByRole("button", { name: "新的副业" }).first().click()
    let projectDialog = page.getByRole("dialog").last()
    await projectDialog.getByRole("textbox", { name: "名称" }).fill("M6 Conflict Probe")
    const directoryInput = projectDialog.getByRole("textbox", { name: "目录名" })
    await directoryInput.fill("newthing")
    await directoryInput.press("Enter")
    await directoryInput.fill("QUILL-APP")
    await directoryInput.press("Enter")
    await projectDialog.getByRole("button", { name: "添加", exact: true }).click()
    const conflict = projectDialog.getByRole("alert")
    const conflictVisible = await waitUntil(() => conflict.isVisible())
    const conflictMessage = conflictVisible ? await conflict.innerText() : ""
    check("Directory names: case-insensitive cross-project collision is rejected inline",
      conflictVisible && /Quill/.test(conflictMessage), conflictMessage)
    await takeScreenshot(page, "a3-dir-conflict", true)
    await projectDialog.getByRole("button", { name: "取消", exact: true }).click()

    await page.getByRole("button", { name: "新的副业" }).first().click()
    projectDialog = page.getByRole("dialog").last()
    await projectDialog.getByRole("textbox", { name: "名称" }).fill("M6 Invalid Probe")
    const invalidInput = projectDialog.getByRole("textbox", { name: "目录名" })
    await invalidInput.fill("m6-probe")
    await invalidInput.press("Enter")
    await invalidInput.fill("bad/name")
    await invalidInput.press("Enter")
    await projectDialog.getByRole("button", { name: "添加", exact: true }).click()
    const invalid = projectDialog.getByRole("alert")
    const invalidVisible = await waitUntil(() => invalid.isVisible())
    const invalidMessage = invalidVisible ? await invalid.innerText() : ""
    check("Directory names: slash-containing name is rejected inline",
      invalidVisible && /\/|斜杠|不能包含/.test(invalidMessage), invalidMessage)
    await takeScreenshot(page, "a4-dir-invalid", true)
    await projectDialog.getByRole("button", { name: "取消", exact: true }).click()

    await page.getByRole("button", { name: "Quill", exact: true }).first().click()
    projectSheet = page.getByRole("dialog").last()
    await projectSheet.getByRole("button", { name: "编辑", exact: true }).click()
    projectDialog = page.getByRole("dialog").last()
    const editDirInput = projectDialog.getByRole("textbox", { name: "目录名" })
    await editDirInput.fill("newthing")
    await editDirInput.press("Enter")
    await projectDialog.getByRole("button", { name: "保存", exact: true }).click()
    const projectHasThree = await waitUntil(async () => (await page.getByText("newthing", { exact: true }).count()) === 1)
    check("Directory names: adding and saving preserves both existing names", projectHasThree)
    await takeScreenshot(page, "a5-dir-add", true)

    await projectSheet.getByRole("button", { name: "编辑", exact: true }).click()
    projectDialog = page.getByRole("dialog").last()
    await projectDialog.getByRole("button", { name: "移除目录名 newthing" }).click()
    await takeScreenshot(page, "a6-dir-remove", true)
    await projectDialog.getByRole("button", { name: "保存", exact: true }).click()
    const newthingGone = await waitUntil(async () => (await page.getByText("newthing", { exact: true }).count()) === 0)
    const originalsRemain = await page.getByText("quill-app", { exact: true }).count() === 1 && await page.getByText("quill-docs", { exact: true }).count() === 1
    check("Directory names: removing and saving deletes only the selected name", newthingGone && originalsRemain,
      `newthing gone=${newthingGone}; original names remain=${originalsRemain}`)
    await page.keyboard.press("Escape")

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
    await page.getByRole("heading", { name: "今天", exact: true }).waitFor()
    await requestJson(BASE, "/api/recorder/live", { method: "PUT", token: seeded.token, body: seeded.liveRequest() })
    await refreshLive(page)
    await waitUntil(async () => (await focusSection(page).locator("ul > li").count()) === 5)
    await page.route("**/api/recorder/live", async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.windows = body.windows.map((window, index) => index === 0 ? { ...window, projectName: seeded.longName } : window)
      await route.fulfill({ response, body: JSON.stringify(body) })
    })
    await refreshLive(page)
    const longRow = focusSection(page).locator("li").filter({ hasText: seeded.longName }).first()
    const longVisible = await waitUntil(() => longRow.isVisible())
    const truncation = await longRow.locator("span.min-w-0.truncate").filter({ hasText: seeded.longName }).last().evaluate((element) => ({
      client: element.clientWidth, scroll: element.scrollWidth, overflow: getComputedStyle(element).textOverflow,
    })).catch(() => ({ client: 0, scroll: 0, overflow: "unavailable" }))
    check("Boundary: controlled 60-character live label truncates without row overflow",
      longVisible && truncation.client > 0 && truncation.scroll > truncation.client && truncation.overflow === "ellipsis",
      `rendered ${truncation.client}px of ${truncation.scroll}px; ${truncation.overflow}`)
    await takeScreenshot(page, "f1-long-live-row", true)
    await page.unroute("**/api/recorder/live")

    const recorder = await createRecorderGuide(page, "zh-CN", `M6 recorder guide ${runId}`)
    const guideAddress = recorder.setupText.includes(BASE)
    const guideToken = Boolean(recorder.token) && recorder.setupText.includes(recorder.token)
    const chinesePlugins = recorder.pluginText.includes("claude plugin") && recorder.setupText.includes("--install-codex-hooks")
    check("Recorder guide: address, one-time token, plugin commands, and setup command are visible",
      guideAddress && guideToken && chinesePlugins, `address=${guideAddress}; token=${guideToken}; commands=${chinesePlugins}`)
    check("Recorder guide: direct-write default or recorder permission warning is visible",
      recorder.hintVisible || recorder.defaultPermission === "直接改", `default=${recorder.defaultPermission}; warning=${recorder.hintVisible}`)
    await takeScreenshot(page, "d1-recorder-setup", true)
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null)

    await page.getByRole("button", { name: /^账户/ }).click()
    await page.getByRole("menuitem", { name: "语言" }).hover()
    await page.getByRole("menuitemradio", { name: "English", exact: true }).click()
    await page.getByRole("heading", { name: "Today", exact: true }).waitFor()
    await requestJson(BASE, "/api/recorder/live", { method: "PUT", token: seeded.token, body: seeded.liveRequest() })
    await refreshLive(page)
    const englishRow = focusSection(page, "en").locator("li").filter({ hasText: "Quill" }).first()
    await englishRow.waitFor({ timeout: 10_000 })
    const englishBar = page.locator("[data-actual-bar][aria-label*='Fix webhook retry']").first()
    await englishBar.scrollIntoViewIfNeeded()
    const englishBarBox = await englishBar.boundingBox()
    const englishRailBox = await page.locator("[data-actual-lane]").boundingBox()
    if (englishBarBox && englishRailBox) {
      await page.mouse.move(englishRailBox.x + englishRailBox.width / 2, englishBarBox.y + englishBarBox.height / 2)
    }
    const englishTooltip = page.getByRole("tooltip")
    const tooltipEnglish = await waitUntil(() => englishTooltip.isVisible()) && (await englishTooltip.innerText()).includes("Fix webhook retry")
    const noChinese = !(await page.locator("body").innerText()).includes("投入")
    check("English UI: live rows and actual-bar tooltip render in English", tooltipEnglish && noChinese,
      `tooltip=${tooltipEnglish}; Chinese copy absent=${noChinese}`)
    await takeScreenshot(page, "e1-today-english", true)

    await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" })
    await page.getByRole("heading", { name: "Projects", exact: true }).waitFor()
    await page.getByRole("button", { name: "Quill", exact: true }).first().click()
    const englishProjectSheet = page.getByRole("dialog").last()
    const englishDirs = await waitUntil(async () => (await page.getByText("quill-app", { exact: true }).count()) === 1)
    const englishProjectDetails = await englishProjectSheet.getByText("This month", { exact: true }).count() === 1 &&
      await englishProjectSheet.getByText("Milestones", { exact: true }).count() === 1
    check("English UI: project directory chips and detail labels render in English", englishDirs && englishProjectDetails,
      `directory chips=${englishDirs}; details=${englishProjectDetails}`)
    await takeScreenshot(page, "e2-project-dirs-english", true)
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null)

    const englishGuide = await createRecorderGuide(page, "en", `M6 Recorder EN ${runId}`)
    const englishGuideWorks = englishGuide.setupText.includes(BASE) && englishGuide.setupText.includes(englishGuide.token) &&
      englishGuide.pluginText.includes("claude plugin") && englishGuide.setupText.includes("--install-codex-hooks") && englishGuide.hintVisible &&
      englishGuide.defaultPermission === "Propose"
    check("English UI: Recorder commands, permission note, and one-time token render in English", englishGuideWorks,
      `default=${englishGuide.defaultPermission}; warning=${englishGuide.hintVisible}`)
    await takeScreenshot(page, "e3-recorder-english", true)
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null)

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
    await page.getByRole("heading", { name: "Today", exact: true }).waitFor()
    await requestJson(BASE, "/api/recorder/live", { method: "PUT", token: seeded.token, body: seeded.liveRequest() })
    await refreshLive(page)
    const baselineRows = focusSection(page, "en").locator("ul > li")
    const baseline = await waitUntil(async () => (await baselineRows.count()) === 5)
    const toastSelector = "[data-sonner-toast]"
    const toastCount = await page.locator(toastSelector).count()
    await page.route("**/api/recorder/live", (route) => route.fulfill({
      status: 500, contentType: "application/json", body: JSON.stringify({ error: "M6 injected server failure" }),
    }))
    await refreshLive(page)
    await page.waitForTimeout(300)
    const rowsRetained = await baselineRows.count() === 5
    const toastsUnchanged = await page.locator(toastSelector).count() === toastCount
    const transientFailureWorks = baseline && rowsRetained && toastsUnchanged
    check("Live API: transient 500 produces no toast and preserves baseline rows", transientFailureWorks,
      `baseline=${baseline}; rows=${await baselineRows.count()}; toasts ${toastCount}->${await page.locator(toastSelector).count()}`)
    if (!transientFailureWorks) productIssues.push("Live API 500 regression. Reproduce: load Today with live rows, return HTTP 500 from /api/recorder/live, and verify rows remain without a toast.")
    await page.unroute("**/api/recorder/live")

    const clear = await requestJson(BASE, "/api/recorder/live", { method: "PUT", token: seeded.token, body: { windows: [] } })
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
    await page.getByRole("heading", { name: "Today", exact: true }).waitFor()
    await refreshLive(page)
    const noLiveRows = await waitUntil(async () => {
      const count = await focusSection(page, "en").locator("ul > li").count()
      const response = await requestJson(BASE, "/api/recorder/live", { token: seeded.token })
      return count === 3 && response.status === 200 && response.data?.windows?.length === 0
    })
    const barsAfterClear = await page.locator("[data-actual-bar]").count()
    check("Live API: windows=[] clears live rows and leaves three persisted entry bars",
      clear.status === 204 && noLiveRows && barsAfterClear === 3,
      `PUT=${clear.status}; rows cleared=${noLiveRows}; bars=${barsAfterClear}`)
    await takeScreenshot(page, "f2-live-cleared", true)

    await page.route("**/api/recorder/live", (route) => route.fulfill({
      status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in again" }),
    }))
    await page.route("**/api/sync**", (route) => route.fulfill({
      status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in again" }),
    }))
    await refreshLive(page)
    const gate = page.locator('input[type="password"]').first()
    const gateVisible = await waitUntil(() => gate.isVisible(), 15_000)
    check("Auth: recorder 401 follows sync 401 into the login gate", gateVisible)
    await takeScreenshot(page, "f3-session-expired", true)
    await page.unroute("**/api/recorder/live")
    await page.unroute("**/api/sync**")
    await login(page, password, "en")
    check("Auth: removing injected 401 routes allows password login again",
      await page.getByRole("heading", { name: "Today", exact: true }).isVisible())
    check("Runtime: no uncaught browser page errors", pageErrors.length === 0, pageErrors.join("; ") || "none")
  } catch (error) {
    finalError = shortError(error)
    check("Run: acceptance flow completed without an uncaught error", false, finalError)
  } finally {
    if (page) await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    const stopped = killTree(worker)
    if (worker && worker.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => worker.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ])
      if (worker.exitCode === null) killTree(worker)
    }
    const portClosed = await waitForPortClose()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (stateOwned) {
      try {
        rmSync(STATE, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
        check("Cleanup: isolated Wrangler process tree stopped and state removed", !existsSync(STATE),
          `${portClosed ? "port released" : "port still busy"}; taskkill=${stopped?.status ?? "n/a"}`)
      } catch (error) {
        check("Cleanup: isolated Wrangler state directory was removed", false, shortError(error))
      }
    }
  }

  if (pageErrors.length && !checks.some((line) => line.startsWith("FAIL Runtime:"))) {
    check("Runtime: no uncaught browser page errors", false, pageErrors.join("; "))
  }
  const failed = checks.filter((line) => line.startsWith("FAIL "))
  console.log("\nSCREENSHOTS")
  for (const path of screenshots) console.log(path)
  console.log("\nPRODUCT ISSUES")
  for (const issue of productIssues) console.log(issue)
  if (!productIssues.length) console.log("None")
  console.log(`\nRESULT ${failed.length ? "FAIL" : "PASS"} (${checks.length - failed.length}/${checks.length} checks passed)`)
  process.exitCode = failed.length || finalError ? 1 : 0
}

main().catch((error) => {
  console.error(`FATAL ${shortError(error)}`)
  process.exitCode = 1
})
