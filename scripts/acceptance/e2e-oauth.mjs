// OAuth 端到端核对：本机起一个 wrangler dev（独立的本地数据库，不碰开发数据），
// 用官方客户端 SDK 当「守规矩的 AI 应用」走完整授权：自助登记一遍、读 VS Code 真实的身份说明一遍；
// 浏览器自动化在授权页登录、选权限、点允许或拒绝；再直接发请求核对续期、断开、权限档、/api 不认授权令牌、个人令牌照常可用、说明书和授权页响应头。
// 先打包在线版再运行：pnpm build && pnpm e2e:oauth
// 访问口令读 .dev.vars 里的 DEVERDESK_PASSWORD（没有就先跑一次 pnpm dev 生成）。
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client, StreamableHTTPClientTransport, UnauthorizedError } from "@modelcontextprotocol/client"
import { chromium } from "playwright-core"
import { McpClient, createSession, createToken, requestJson } from "./mcp-client.mjs"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))
const PORT = process.env.E2E_OAUTH_PORT ?? "8792"
const BASE = `http://127.0.0.1:${PORT}`
const STATE = ".wrangler/e2e-oauth-state"
const SDK_CALLBACK = "http://127.0.0.1:43123/callback"
const VSCODE_ID = "https://vscode.dev/oauth/client-metadata.json"
const VSCODE_CALLBACK = "http://127.0.0.1:33418/"
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

function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
  else child.kill("SIGTERM")
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/session`)).ok) return
    } catch {
      // 还没起来
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("wrangler dev 没有起来")
}

/** 内存里的 OAuth 客户端：SDK 要的东西都放在这里；跳去授权页时只记下地址，由浏览器去点 */
class MemoryProvider {
  constructor({ name, redirectUrl, clientMetadataUrl }) {
    this.name = name
    this._redirectUrl = redirectUrl
    this.clientMetadataUrl = clientMetadataUrl
    this.client = undefined
    this.saved = undefined
    this.verifier = ""
    this.authorizationUrl = null
  }

  get redirectUrl() {
    return this._redirectUrl
  }

  get clientMetadata() {
    return {
      client_name: this.name,
      redirect_uris: [this._redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }
  }

  clientInformation() {
    return this.client
  }

  saveClientInformation(info) {
    this.client = info
  }

  tokens() {
    return this.saved
  }

  saveTokens(tokens) {
    this.saved = tokens
  }

  redirectToAuthorization(url) {
    this.authorizationUrl = url
  }

  saveCodeVerifier(verifier) {
    this.verifier = verifier
  }

  codeVerifier() {
    return this.verifier
  }

  // 记下授权时用的授权方，换令牌时 SDK 核对跳回来的 iss 和它一致（SEP-2352）
  saveDiscoveryState(state) {
    this.discovery = state
  }

  discoveryState() {
    return this.discovery
  }
}

function transportFor(provider) {
  return new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { authProvider: provider })
}

/** 第一次连：服务器回 401，SDK 读说明书、认身份、生成授权地址后抛 UnauthorizedError */
async function startAuthorization(provider) {
  const client = new Client({ name: "deverdesk-oauth-e2e", version: "1.0.0" })
  try {
    await client.connect(transportFor(provider))
    await client.close()
    return null
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error
  }
  return provider.authorizationUrl
}

/** 在授权页上：没登录先输口令；等授权卡出来，按需选权限，点允许或拒绝，截住跳回去的地址 */
async function authorizeInBrowser(page, authorizationUrl, { callback, tier, decision = "允许", password }) {
  let returned = null
  const callbackOrigin = new URL(callback).origin
  await page.route(`${callbackOrigin}/**`, async (route) => {
    returned = route.request().url()
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" })
  })
  await page.goto(authorizationUrl.toString(), { waitUntil: "networkidle" })
  const passcode = page.getByLabel("访问口令")
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill(password)
    await page.getByRole("button", { name: "登录" }).click()
  }
  const heading = page.getByRole("heading", { level: 1 })
  await heading.waitFor({ timeout: 15_000 })
  const title = (await heading.textContent()) ?? ""
  const subtitle = (await page.locator("main p").first().textContent()) ?? ""
  if (tier) await page.getByRole("radio", { name: tier }).click()
  await page.getByRole("button", { name: decision, exact: true }).click()
  const deadline = Date.now() + 15_000
  while (!returned && Date.now() < deadline) await page.waitForTimeout(100)
  await page.unroute(`${callbackOrigin}/**`)
  return { title, subtitle, returned: returned ? new URL(returned) : null }
}

async function connectedClient(provider) {
  const client = new Client({ name: "deverdesk-oauth-e2e", version: "1.0.0" })
  await client.connect(transportFor(provider))
  return client
}

const password = readPassword()
if (!existsSync(join(ROOT, "out", "authorize.html"))) throw new Error("先打包在线版：pnpm build")

rmSync(join(ROOT, STATE), { recursive: true, force: true })
const migrate = spawnSync(`wrangler d1 migrations apply DB --local --persist-to ${STATE}`, { cwd: ROOT, env, shell: true, encoding: "utf8" })
if (migrate.status !== 0) throw new Error(`数据库迁移失败：${migrate.stderr || migrate.stdout}`)

const worker = spawn(`wrangler dev --port ${PORT} --persist-to ${STATE}`, { cwd: ROOT, env, shell: true, stdio: "ignore" })
const browser = await chromium.launch({ channel: "msedge", headless: true })
const pageErrors = []

try {
  await waitForServer()
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" })
  const page = await context.newPage()
  page.on("pageerror", (error) => pageErrors.push(error.message))
  const { cookie } = await createSession(BASE, password)

  // 1. 说明书、401 指针、授权页响应头
  const resource = await requestJson(BASE, "/.well-known/oauth-protected-resource/mcp")
  check("说明书：资源地址是本站 /mcp，授权方是本站", resource.data?.resource === `${BASE}/mcp` && resource.data?.authorization_servers?.[0] === BASE)
  const server = await requestJson(BASE, "/.well-known/oauth-authorization-server")
  check(
    "说明书：S256、身份说明、iss 都写上",
    server.data?.code_challenge_methods_supported?.includes("S256")
      && server.data?.client_id_metadata_document_supported === true
      && server.data?.authorization_response_iss_parameter_supported === true,
  )
  const anonymous = await new McpClient(BASE, "").listTools()
  check("/mcp 没带令牌：401 并指向资源说明书", anonymous.status === 401
    && (anonymous.responseHeaders.wwwAuthenticate ?? "").includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`))
  const pageResponse = await fetch(`${BASE}/authorize?client_id=x`)
  check("授权页：禁止被嵌入、不缓存", pageResponse.ok
    && pageResponse.headers.get("content-security-policy") === "frame-ancestors 'none'"
    && pageResponse.headers.get("x-frame-options") === "DENY"
    && pageResponse.headers.get("cache-control") === "no-store")

  // 2. 官方 SDK 自助登记 → 授权页登录、默认「只能提议」、允许 → 换令牌 → 调工具
  const sdk = new MemoryProvider({ name: "E2E 自助登记客户端", redirectUrl: SDK_CALLBACK })
  const sdkUrl = await startAuthorization(sdk)
  check("SDK：拿到授权地址，走的是自助登记", Boolean(sdkUrl) && sdk.client?.client_id?.startsWith("ddcl_"), sdk.client?.client_id ?? "")
  const sdkConsent = await authorizeInBrowser(page, sdkUrl, { callback: SDK_CALLBACK, password })
  check("授权页：标题按来连的应用显示名字", sdkConsent.title === "E2E 自助登记客户端 想连接你的 DeverDesk", sdkConsent.title)
  check("授权页：跳回本机时提醒交给这台电脑上的程序", sdkConsent.subtitle.includes("授权后交给这台电脑上的程序") && sdkConsent.subtitle.includes("127.0.0.1:43123"), sdkConsent.subtitle)
  check("跳回：带 code、原样的 state 和 iss", Boolean(sdkConsent.returned?.searchParams.get("code")) && sdkConsent.returned?.searchParams.get("iss") === BASE)
  await transportFor(sdk).finishAuth(sdkConsent.returned.searchParams)
  check("SDK：换到通行令牌和续期令牌", sdk.saved?.access_token?.startsWith("ddo_") && sdk.saved?.refresh_token?.startsWith("ddr_"))
  const sdkClient = await connectedClient(sdk)
  const proposeTools = (await sdkClient.listTools()).tools.map((tool) => tool.name)
  check("权限：「只能提议」看得到写工具", proposeTools.includes("add_tasks") && proposeTools.includes("get_day"), `${proposeTools.length} 个工具`)
  const day = await sdkClient.callTool({ name: "get_day", arguments: {} })
  check("调工具：get_day 正常返回", day.isError !== true && typeof day.structuredContent?.date === "string")
  const added = await sdkClient.callTool({ name: "add_tasks", arguments: { tasks: [{ title: "OAuth 端到端：提议的任务" }] } })
  check("调工具：写入存成提议", added.structuredContent?.changeset?.status === "proposed", JSON.stringify(added.structuredContent?.changeset ?? {}))
  const changesets = await requestJson(BASE, "/api/ai/changesets?status=pending", { cookie })
  check("AI 动态：提议记在这个应用名下", changesets.data?.changesets?.[0]?.clientName === "E2E 自助登记客户端")
  await sdkClient.close()

  // 3. 续期：换出新的一对，旧通行令牌之外新的也能用
  const refreshed = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: sdk.saved.refresh_token, client_id: sdk.client.client_id }),
  })
  const refreshedTokens = await refreshed.json()
  check("续期：换出新的通行令牌和续期令牌", refreshed.ok && refreshedTokens.refresh_token !== sdk.saved.refresh_token)
  const viaRefreshed = await new McpClient(BASE, refreshedTokens.access_token).listTools()
  check("续期：新通行令牌能调 /mcp", viaRefreshed.status === 200)
  const apiWithOAuth = await requestJson(BASE, "/api/sync?since=0&limit=10", { token: refreshedTokens.access_token })
  check("授权令牌只能用于 /mcp：调同步接口 401", apiWithOAuth.status === 401)

  // 4. 读 VS Code 真实的身份说明 → 选「只看」→ 只给读工具
  const vscode = new MemoryProvider({ name: "ignored", redirectUrl: VSCODE_CALLBACK, clientMetadataUrl: VSCODE_ID })
  const vscodeUrl = await startAuthorization(vscode)
  check("SDK：走身份说明，客户端编号就是网址", vscodeUrl?.searchParams.get("client_id") === VSCODE_ID)
  const vscodeConsent = await authorizeInBrowser(page, vscodeUrl, { callback: VSCODE_CALLBACK, tier: "只看", password })
  check("授权页：名字取自身份说明", vscodeConsent.title === "Visual Studio Code 想连接你的 DeverDesk", vscodeConsent.title)
  await transportFor(vscode).finishAuth(vscodeConsent.returned.searchParams)
  const readClient = await connectedClient(vscode)
  const readTools = (await readClient.listTools()).tools.map((tool) => tool.name)
  check("权限：「只看」只给读工具", readTools.length === 8 && !readTools.includes("add_tasks"), readTools.join(","))
  await readClient.close()

  // 5. 拒绝：带 access_denied 和 iss 跳回，不发授权码
  const denied = new MemoryProvider({ name: "E2E 被拒绝的客户端", redirectUrl: SDK_CALLBACK })
  const deniedUrl = await startAuthorization(denied)
  const deniedResult = await authorizeInBrowser(page, deniedUrl, { callback: SDK_CALLBACK, decision: "拒绝", password })
  check("拒绝：跳回带 access_denied，没有 code", deniedResult.returned?.searchParams.get("error") === "access_denied"
    && !deniedResult.returned?.searchParams.get("code") && deniedResult.returned?.searchParams.get("iss") === BASE)

  // 请求在点允许之前就有错：跳回地址不一定可信，不自动跳，给「回到」按钮
  const broken = new URL(deniedUrl)
  broken.searchParams.set("response_type", "token")
  await page.goto(broken.toString(), { waitUntil: "networkidle" })
  await page.getByText(/发来的授权请求有误/).waitFor({ timeout: 10_000 })
  check("请求有误：不自动跳走，给「回到」按钮", page.url().startsWith(`${BASE}/authorize`)
    && await page.getByRole("button", { name: "回到 127.0.0.1:43123" }).isVisible())

  // 6. 连接 AI 列表：授权连接和个人令牌在一起；断开后马上 401
  const personal = await createToken(BASE, cookie, { name: "E2E 个人令牌", tier: "read" })
  const listed = await requestJson(BASE, "/api/tokens", { cookie })
  const rows = Array.isArray(listed.data) ? listed.data : []
  const sdkRow = rows.find((row) => row.name === "E2E 自助登记客户端")
  check("列表：授权连接带网站、权限，和个人令牌放在一起",
    sdkRow?.kind === "oauth" && sdkRow?.tier === "propose" && rows.some((row) => row.kind === "token"), JSON.stringify(rows.map((row) => [row.name, row.kind])))
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /^账户/ }).click()
  await page.getByRole("menuitem", { name: "连接 AI" }).click()
  await page.getByRole("button", { name: "复制" }).first().waitFor({ timeout: 10_000 })
  const connector = await page.getByLabel("连接器地址").inputValue()
  check("弹窗：顶部显示连接器地址", connector === `${BASE}/mcp`, connector)
  const row = page.locator("li", { hasText: "E2E 自助登记客户端" })
  check("弹窗：授权连接显示网站和「断开」", await row.getByText(/127\.0\.0\.1:43123/).isVisible() && await row.getByRole("button", { name: "断开" }).isVisible())
  await row.getByRole("button", { name: "断开" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "断开" }).click()
  await row.waitFor({ state: "detached", timeout: 10_000 })
  const afterDisconnect = await new McpClient(BASE, refreshedTokens.access_token).listTools()
  check("断开：旧通行令牌马上 401", afterDisconnect.status === 401)
  const stillPersonal = await new McpClient(BASE, personal.token).listTools()
  check("个人令牌照常能连 /mcp", stillPersonal.status === 200)

  check("页面没有报错", pageErrors.length === 0, pageErrors.join(" | "))
} catch (error) {
  check("流程跑完", false, error instanceof Error ? error.stack ?? error.message : String(error))
} finally {
  await browser.close()
  killTree(worker)
}

for (const line of results) console.log(line)
const failed = results.filter((line) => line.startsWith("FAIL")).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed === 0 ? 0 : 1)
