/**
 * 一条命令在本地跑起在线版：next dev（页面）+ wrangler dev（接口）+ D1 本地迁移。
 *
 * 用法：
 *   pnpm dev                # 页面 http://localhost:3000，接口跑在 8787，页面里的 /api 转给接口
 *   pnpm dev:local          # 只跑本地版页面，不需要接口（等价于 node scripts/dev.mjs --local）
 *   PORT=3100 pnpm dev      # 换页面端口（PowerShell：$env:PORT=3100; pnpm dev）
 *   API_PORT=8790 pnpm dev  # 换接口端口（PowerShell：$env:API_PORT=8790; pnpm dev）
 *
 * 行为：
 *   - 没有 .dev.vars 时，从 .dev.vars.example 复制一份并把口令填成 dev，终端会打印「本地访问口令：dev」
 *   - 启动接口前先跑 `wrangler d1 migrations apply DB --local`（把数据库表建好 / 补齐）
 *   - 页面进程带 NEXT_PUBLIC_DEVERDESK_EDITION=cloud 和 DEVERDESK_API_PROXY，
 *     next.config.ts 会按后者把 /api 请求转发给接口进程
 *   - 任一个退出或按 Ctrl+C 时，把另一个（在 Windows 上连同整个子进程树）也结束
 *   - --local 时只启动 next dev，版本设为 local，不需要接口和数据库
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { delimiter, join } from "node:path"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const IS_WINDOWS = process.platform === "win32"

const PAGE_PREFIX = "[页面]"
const API_PREFIX = "[接口]"

function parseArgs(argv) {
  for (const arg of argv) {
    if (arg === "--local") return "local"
    console.error(`dev: 无法识别的参数 ${arg}（用法：node scripts/dev.mjs [--local]）`)
    process.exit(1)
  }
  return "cloud"
}

const edition = parseArgs(process.argv.slice(2))

function readPort(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

const pagePort = readPort("PORT", 3000)
const apiPort = readPort("API_PORT", 8787)

// wrangler dev 从 .dev.vars 读秘密变量（已 git 忽略）；没有就从模板复制一份，口令先用 dev
const devVarsPath = join(ROOT, ".dev.vars")
if (!existsSync(devVarsPath)) {
  const example = readFileSync(join(ROOT, ".dev.vars.example"), "utf8")
  writeFileSync(devVarsPath, example.replace(/^DEVERDESK_PASSWORD=\s*$/m, "DEVERDESK_PASSWORD=dev"))
  console.log("dev: 已从 .dev.vars.example 创建 .dev.vars")
  console.log("dev: 本地访问口令：dev")
}

// wrangler dev 要求静态资源目录存在，没有就先建一个空的
const outDir = join(ROOT, "out")
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true })
  console.log("dev: 已创建空的 out/ 目录（wrangler dev 需要）")
}

// 直接 node 运行本脚本时 PATH 里没有 node_modules/.bin，补进去让 `wrangler` 和 `next` 能被找到
const env = {
  ...process.env,
  PATH: [join(ROOT, "node_modules", ".bin"), process.env.PATH ?? ""].join(delimiter),
}

// ---------- 启动接口前先做本地迁移 ----------

if (edition === "cloud") {
  console.log("dev: 运行 wrangler d1 migrations apply DB --local")
  const migrate = spawnSync("wrangler d1 migrations apply DB --local", {
    cwd: ROOT,
    env,
    shell: true,
    stdio: "inherit",
  })
  if (migrate.error) {
    console.error(`dev: 迁移启动失败：${migrate.error.message}`)
    process.exit(1)
  }
  if (migrate.status !== 0) {
    console.error(`dev: 迁移失败，退出码 ${migrate.status ?? "null"}`)
    process.exit(migrate.status ?? 1)
  }
}

// ---------- 同时跑页面和接口 ----------

/**
 * 结束一个进程及其全部子进程。
 * wrangler 和 next 在 Windows 上都会再起 node 子进程，kill 只杀得到最外层，
 * 必须用 `taskkill /F /T` 才能把整棵进程树真的结束掉。
 */
function killTree(child) {
  if (child.pid === undefined) return
  if (child.exitCode !== null || child.signalCode !== null) return
  if (IS_WINDOWS) {
    // 整串命令而不是参数数组，避免 Node 对「shell + 参数数组」的 DEP0190 告警
    spawn(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore", shell: true })
  } else {
    child.kill("SIGTERM")
    // 兜底：2 秒后还活着就强杀
    const timer = setTimeout(() => child.kill("SIGKILL"), 2000)
    timer.unref()
  }
}

/** 给子进程的每行输出加前缀，\r\n / \r / \n 都能对上 */
function prefixStream(stream, prefix) {
  let buffer = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r\n|\r|\n/)
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line.trim().length > 0) console.log(`${prefix} ${line}`)
    }
  })
  stream.on("end", () => {
    if (buffer.trim().length > 0) console.log(`${prefix} ${buffer}`)
  })
}

const children = []
let shuttingDown = false

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) killTree(child)
  // 给 taskkill 一点时间，避免父进程先退出留下孤儿进程
  setTimeout(() => process.exit(code), IS_WINDOWS ? 500 : 100).unref()
}

function startChild(name, prefix, command, extraEnv = {}) {
  const child = spawn(command, {
    cwd: ROOT,
    env: { ...env, ...extraEnv },
    shell: IS_WINDOWS,
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.on("error", (error) => {
    console.error(`dev: ${name}启动失败：${error.message}`)
    shutdown(1)
  })
  child.on("exit", (code, signal) => {
    if (shuttingDown) return
    console.error(`dev: ${name}退出了（${signal ?? `退出码 ${code}`}），把另一个也关掉`)
    shutdown(code ?? 1)
  })
  prefixStream(child.stdout, prefix)
  prefixStream(child.stderr, prefix)
  return child
}

if (edition === "local") {
  console.log(`dev: 启动本地版页面（http://localhost:${pagePort}）`)
  // 版本要显式设成本地版：不设时默认是在线版，页面会去找不存在的接口
  children.push(
    startChild("next dev ", PAGE_PREFIX, `next dev --port ${pagePort}`, { NEXT_PUBLIC_DEVERDESK_EDITION: "local" }),
  )
} else {
  console.log(
    `dev: 启动在线版（页面 http://localhost:${pagePort}，接口 http://127.0.0.1:${apiPort}）`,
  )
  children.push(startChild("wrangler dev ", API_PREFIX, `wrangler dev --port ${apiPort}`))
  children.push(
    startChild("next dev ", PAGE_PREFIX, `next dev --port ${pagePort}`, {
      NEXT_PUBLIC_DEVERDESK_EDITION: "cloud",
      DEVERDESK_API_PROXY: `http://127.0.0.1:${apiPort}`,
    }),
  )
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log("dev: 收到退出信号，正在关闭……")
    shutdown(0)
  })
}

// 让父进程一直活着，直到子进程退出后在 shutdown 里主动 exit
setInterval(() => {}, 1 << 30)
