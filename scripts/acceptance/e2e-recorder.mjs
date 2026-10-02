import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  jsonText,
  runCaptureSync as captureSync,
  runClaudePhase,
  runSyntheticPhase,
  sanitizeText,
  spawnProgram,
  stopActiveProcesses,
  stopProcessesInDirectory,
  waitForChildClose,
} from "./recorder-helpers.mjs"
import {
  createSession,
  createToken,
  isSuccessToolCall,
  McpClient,
  requestJson,
} from "./mcp-client.mjs"

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)))
const PORT = process.env.E2E_PORT ?? "8792"
const BASE = `http://127.0.0.1:${PORT}`
const STATE_RELATIVE = ".wrangler/e2e-recorder-state"
const STATE_DIR = join(ROOT, STATE_RELATIVE)
const ASSETS_RELATIVE = ".wrangler/dev-assets"
const ASSETS_DIR = join(ROOT, ASSETS_RELATIVE)
const RECORDER_BIN = join(ROOT, "integrations", "claude-code", "bin", "deverdesk-recorder")
const WRITE_NAME = "E2E Recorder Write"
const READ_NAME = "E2E Recorder Read"
const CLAUDE_TIMEOUT_MS = 5 * 60_000
const BUILD_RETRIES = 6
const BUILD_RETRY_DELAY_MS = 3 * 60_000
const PULL_LIMIT = 500
const MAX_RUN_MS = 8 * 60_000
const CLEANUP_RESERVE_MS = 60_000
const TERMINATION_RESERVE_MS = 30_000
const ACTION_RUN_MS = MAX_RUN_MS - CLEANUP_RESERVE_MS - TERMINATION_RESERVE_MS

const results = []
const secrets = []
const phaseTimes = { setup: 0, claude: 0, synthetic: 0, cleanup: 0 }
const phaseStarted = { setup: Date.now() }
let tempRoot
let worker
let workerLogs = ""
let workerExitDetail = ""
let password = ""
let context = {}
let runDeadline = 0
let deadlineExceeded = false
let lastCheckAt = Date.now()

function check(name, ok, detail = "", phase = "setup") {
  const now = Date.now()
  const safeDetail = sanitizeText(detail, secrets).trim()
  const result = { name, ok: Boolean(ok), phase, detail: safeDetail, elapsedMs: now - lastCheckAt }
  results.push(result)
  lastCheckAt = now
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name} [${(result.elapsedMs / 1000).toFixed(1)}s]${!result.ok && result.detail ? ` — ${result.detail}` : ""}`)
}

function beginPhase(phase) {
  phaseStarted[phase] = Date.now()
}

function endPhase(phase) {
  phaseTimes[phase] += Date.now() - (phaseStarted[phase] ?? Date.now())
}

function currentPhase(phase, action) {
  beginPhase(phase)
  return Promise.resolve().then(action).finally(() => endPhase(phase))
}

function remainingRunMs() {
  return Math.max(0, runDeadline - Date.now())
}

function runCaptureSync(command, args, options = {}) {
  const remaining = remainingRunMs() - CLEANUP_RESERVE_MS
  if (remaining <= 0) {
    return { code: null, signal: null, stdout: "", stderr: "", error: new Error("8-minute acceptance deadline reached"), timedOut: true }
  }
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 120_000, remaining))
  return captureSync(command, args, { ...options, timeoutMs })
}

function callSummary(call) {
  return jsonText({
    status: call?.exchange?.status,
    isError: call?.isError,
    text: call?.text,
    structuredContent: call?.structuredContent,
  })
}

function parsePassword() {
  const path = join(ROOT, ".dev.vars")
  if (!existsSync(path)) return ""
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((item) => item.startsWith("DEVERDESK_PASSWORD="))
  if (!line) return ""
  let value = line.slice("DEVERDESK_PASSWORD=".length).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return value
}

function baseEnvironment(home) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key === "CLAUDECODE" || key.startsWith("CLAUDE_")) delete env[key]
  }
  return {
    ...env,
    PATH: [join(ROOT, "node_modules", ".bin"), env.PATH ?? ""].filter(Boolean).join(delimiter),
    DEVERDESK_HOME: home,
    DEVERDESK_URL: BASE,
  }
}

// 真实 Claude Code 用默认配置目录里的登录凭据（不要指向临时配置目录，那里没有凭据）；
// 隔离靠命令行的 --no-session-persistence 和 --setting-sources project，只去掉嵌套会话的环境变量
function claudeEnvironment(source) {
  const env = { ...source }
  for (const key of Object.keys(env)) {
    if (key === "CLAUDECODE" || key.startsWith("CLAUDE_")) delete env[key]
  }
  return env
}

function localDateKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}


function createFixtureRepo(path) {
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, "README.md"), "Temporary acceptance fixture.\n", "utf8")
  const commands = [
    ["init"],
    ["config", "user.name", "DeverDesk E2E"],
    ["config", "user.email", "e2e@example.invalid"],
    ["add", "--all"],
    ["-c", "commit.gpgsign=false", "commit", "-m", "chore: initial fixture"],
  ]
  for (const args of commands) {
    const result = runCaptureSync("git.exe", ["-C", path, ...args], { cwd: path, timeoutMs: 30_000 })
    if (result.code !== 0) {
      throw new Error(`Git fixture setup failed: ${args.join(" ")}\n${result.stderr || result.stdout || result.error?.message || "unknown error"}`)
    }
  }
}


async function getSnapshot(token) {
  const latest = new Map()
  let cursor = 0
  for (let page = 0; page < 100; page += 1) {
    const response = await requestJson(BASE, `/api/sync?since=${cursor}&limit=${PULL_LIMIT}`, { token })
    if (response.status !== 200 || !Array.isArray(response.data?.records)) {
      return { ok: false, error: `HTTP ${response.status}: ${response.text}`, latest }
    }
    const records = response.data.records
    for (const record of records) {
      if (!record || typeof record.kind !== "string" || typeof record.id !== "string") continue
      const key = `${record.kind}:${record.id}`
      const previous = latest.get(key)
      if (!previous || record.rev > previous.rev) latest.set(key, record)
    }
    const nextCursor = response.data.cursor
    if (!response.data.more || !Number.isSafeInteger(nextCursor) || nextCursor <= cursor) break
    cursor = nextCursor
  }
  return { ok: true, latest }
}

function currentData(snapshot, kind) {
  return [...snapshot.latest.values()]
    .filter((record) => record.kind === kind && record.data !== null && record.data !== undefined)
    .map((record) => record.data)
}

function snapshotSignature(snapshot) {
  return [...snapshot.latest.values()]
    .filter((record) => record.data !== null && record.data !== undefined)
    .map((record) => `${record.kind}:${record.id}:${JSON.stringify(record.data)}`)
    .sort()
    .join("\n")
}

function uploadKeys(home) {
  const path = join(home, "uploaded.jsonl")
  if (!existsSync(path)) return []
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  }).filter((item) => item && typeof item.k === "string")
}

function taskCodeNumber(value) {
  const match = String(value ?? "").match(/\bT-(\d+)\b/i)
  return match ? Number(match[1]) : null
}

function commandDetail(result) {
  return [
    `code=${result.code ?? "null"}${result.signal ? ` signal=${result.signal}` : ""}${result.timedOut ? " timeout" : ""}`,
    result.error ? `error=${result.error.message}` : "",
    result.stdout ? `stdout:\n${result.stdout}` : "",
    result.stderr ? `stderr:\n${result.stderr}` : "",
  ].filter(Boolean).join("\n")
}

async function ensureRecorderBuild() {
  let lastResult
  let attempts = 0
  for (let attempt = 1; attempt <= BUILD_RETRIES; attempt += 1) {
    if (remainingRunMs() <= CLEANUP_RESERVE_MS) break
    attempts = attempt
    lastResult = runCaptureSync("pnpm.cmd", ["build:recorder"], { cwd: ROOT, timeoutMs: 120_000 })
    if (lastResult.code === 0) {
      check("pnpm build:recorder", true)
      return true
    }
    if (attempt < BUILD_RETRIES && remainingRunMs() > BUILD_RETRY_DELAY_MS + CLEANUP_RESERVE_MS + TERMINATION_RESERVE_MS + 75_000) {
      console.log(`BUILD attempt ${attempt}/${BUILD_RETRIES} failed; retrying in 180 seconds`)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, BUILD_RETRY_DELAY_MS))
    } else {
      break
    }
  }
  check("pnpm build:recorder", false, `${attempts} attempts made within the 8-minute deadline\n${lastResult ? commandDetail(lastResult) : "No build attempt could start before the deadline."}`)
  return false
}

async function assertPortAvailable() {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
    check("独立 Wrangler 端口未被占用", false, `HTTP ${response.status} already answers at ${BASE}`)
    return false
  } catch {
    check("独立 Wrangler 端口未被占用", true)
    return true
  }
}

async function waitForWorker() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (worker?.exitCode !== null && worker?.exitCode !== undefined) return false
    try {
      const response = await fetch(`${BASE}/api/session`, { signal: AbortSignal.timeout(1500) })
      if (response.status < 500) return true
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  return false
}

async function cleanup() {
  beginPhase("cleanup")
  if (!deadlineExceeded) stopActiveProcesses()
  if (worker) {
    await waitForChildClose(worker, 8_000)
    worker.stdin?.destroy()
    worker.stdout?.destroy()
    worker.stderr?.destroy()
    const stopped = worker.exitCode !== null || worker.signalCode !== null
    check("Wrangler 及子进程已停止", stopped, workerLogs, "cleanup")
  }
  try {
    // Wrangler 刚停，Windows 上它占着的文件要等一会儿才放开，重试几次
    for (let attempt = 0; ; attempt += 1) {
      try {
        rmSync(STATE_DIR, { recursive: true, force: true })
        break
      } catch (error) {
        if (attempt >= 8) throw error
        await new Promise((resolve) => setTimeout(resolve, 750))
      }
    }
    check("清理独立 Wrangler D1 状态目录", !existsSync(STATE_DIR), STATE_DIR, "cleanup")
  } catch (error) {
    check("清理独立 Wrangler D1 状态目录", false, error instanceof Error ? error.message : String(error), "cleanup")
  }
  if (tempRoot) {
    const isolatedProcesses = stopProcessesInDirectory(tempRoot)
    check(
      "临时目录内的后台进程已停止",
      isolatedProcesses.error === null,
      jsonText(isolatedProcesses),
      "cleanup",
    )
    try {
      rmSync(tempRoot, { recursive: true, force: true })
      check("清理记录器临时目录", !existsSync(tempRoot), tempRoot, "cleanup")
    } catch (error) {
      check("清理记录器临时目录", false, error instanceof Error ? error.message : String(error), "cleanup")
    }
  }
  endPhase("cleanup")
}

function printResults(totalElapsedMs) {
  for (const [phase, label] of [["setup", "准备"], ["claude", "真实 Claude Code 第一段"], ["synthetic", "人工事件第二段"], ["cleanup", "清理"]]) {
    const inPhase = results.filter((result) => result.phase === phase)
    const passed = inPhase.filter((result) => result.ok).length
    const failed = inPhase.length - passed
    console.log(`${label}: ${passed} PASS / ${failed} FAIL，用时 ${(phaseTimes[phase] / 1000).toFixed(1)} 秒`)
  }
  const totalMs = totalElapsedMs ?? Object.values(phaseTimes).reduce((total, value) => total + value, 0)
  console.log(`总用时: ${(totalMs / 1000).toFixed(1)} 秒${deadlineExceeded ? " (8-minute deadline exceeded)" : ""}`)
}

async function main() {
  const runStartedAt = Date.now()
  runDeadline = runStartedAt + ACTION_RUN_MS
  const deadlineTimer = setTimeout(() => {
    deadlineExceeded = true
    stopActiveProcesses()
  }, ACTION_RUN_MS)
  deadlineTimer.unref()
  try {
    const portNumber = Number(PORT)
    const portValid = /^\d{1,5}$/.test(PORT) && portNumber >= 1 && portNumber <= 65_535 && ![3000, 8787].includes(portNumber)
    check("E2E_PORT 是合法且不占用保留端口", portValid, portValid ? "" : `invalid or protected port: ${PORT}`)
    if (!portValid) throw new Error("Invalid or protected E2E_PORT")
    if (!(await assertPortAvailable())) throw new Error("E2E port is already in use")

    password = parsePassword()
    if (!password) {
      check(".dev.vars 提供本机 Worker 访问口令", false, ".dev.vars missing or DEVERDESK_PASSWORD is empty")
      throw new Error("Local Worker password is unavailable")
    }
    secrets.push(password)
    check(".dev.vars 提供本机 Worker 访问口令", true)

    const built = await ensureRecorderBuild()
    if (!built) throw new Error("Recorder build failed after retries within the deadline")

    tempRoot = mkdtempSync(join(tmpdir(), "deverdesk-e2e-recorder-"))
    const home = join(tempRoot, "deverdesk-home")
    const reposDir = join(tempRoot, "repos")
    mkdirSync(home, { recursive: true })
    mkdirSync(reposDir, { recursive: true })
    const projectDir = join(reposDir, "e2e-app")
    const unboundDir = join(reposDir, "unbound-app")
    createFixtureRepo(projectDir)
    createFixtureRepo(unboundDir)
    context = { home, projectDir, unboundDir, recorderBin: RECORDER_BIN, remainingRunMs, cleanupReserveMs: CLEANUP_RESERVE_MS }
    check("e2e-app 与 unbound-app 是临时 Git 仓库", existsSync(join(projectDir, ".git")) && existsSync(join(unboundDir, ".git")), `${projectDir}\n${unboundDir}`)

    const env = baseEnvironment(home)
    context.env = env
    mkdirSync(join(ROOT, ".wrangler"), { recursive: true })
    if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true })
    const assetsEmpty = readdirSync(ASSETS_DIR).length === 0
    check("Wrangler dev-assets 目录为空", assetsEmpty, assetsEmpty ? "" : `existing files: ${readdirSync(ASSETS_DIR).join(", ")}`)
    if (!assetsEmpty) throw new Error("Refusing to use a non-empty .wrangler/dev-assets directory")

    rmSync(STATE_DIR, { recursive: true, force: true })
    const migration = runCaptureSync("wrangler.cmd", ["d1", "migrations", "apply", "DB", "--local", "--persist-to", STATE_RELATIVE], { cwd: ROOT, env, timeoutMs: 120_000 })
    check("独立 Wrangler D1 migrations apply 成功", migration.code === 0, commandDetail(migration))
    if (migration.code !== 0) throw new Error("D1 migration failed")

    if (!(await assertPortAvailable())) throw new Error("E2E port was claimed while setup was running")
    worker = spawnProgram("wrangler.cmd", ["dev", "--port", PORT, "--persist-to", STATE_RELATIVE, "--assets", ASSETS_RELATIVE], { cwd: ROOT, env })
    worker.once("error", (error) => { workerExitDetail = `spawn error: ${error.message}` })
    worker.once("exit", (code, signal) => { workerExitDetail = `Wrangler child exit code=${code} signal=${signal ?? "none"}` })
    worker.stdout?.on("data", (chunk) => { workerLogs = (workerLogs + chunk.toString("utf8")).slice(-40_000) })
    worker.stderr?.on("data", (chunk) => { workerLogs = (workerLogs + chunk.toString("utf8")).slice(-40_000) })
    const workerReady = await waitForWorker()
    check("独立 Wrangler Worker 启动并响应", workerReady, workerLogs || workerExitDetail || "Wrangler exited without stdout/stderr")
    if (!workerReady) throw new Error("Wrangler Worker failed to start")

    const session = await createSession(BASE, password)
    context.cookie = session.cookie
    check("本机 Worker session cookie 创建成功", session.exchange.status === 200 && Boolean(session.cookie), jsonText(session.exchange))
    if (!context.cookie) throw new Error("Worker session cookie unavailable")
    secrets.push(context.cookie)

    const writeToken = await createToken(BASE, context.cookie, { name: WRITE_NAME, tier: "write" })
    const readToken = await createToken(BASE, context.cookie, { name: READ_NAME, tier: "read" })
    context.writeToken = writeToken.token
    context.readToken = readToken.token
    if (context.writeToken) secrets.push(context.writeToken)
    if (context.readToken) secrets.push(context.readToken)
    check("session cookie 创建 read 与 write 令牌", writeToken.exchange.status === 201 && writeToken.tier === "write" && Boolean(writeToken.token) && readToken.exchange.status === 201 && readToken.tier === "read" && Boolean(readToken.token), jsonText({ write: { status: writeToken.exchange.status, tier: writeToken.tier }, read: { status: readToken.exchange.status, tier: readToken.tier } }))
    if (!context.writeToken || !context.readToken) throw new Error("Recorder tokens unavailable")
    context.recorderEnv = { ...env, DEVERDESK_TOKEN: context.writeToken }
    context.claudeEnv = claudeEnvironment(context.recorderEnv)

    const writeMcp = new McpClient(BASE, context.writeToken)
    const dayCall = await writeMcp.callTool("get_day", {})
    const today = dayCall.structuredContent?.date
    check("write MCP 可读取 Worker 今日日期", isSuccessToolCall(dayCall) && typeof today === "string", callSummary(dayCall))

    const projectCall = await writeMcp.callTool("manage_project", {
      action: "create",
      name: "E2E App",
      directories: ["e2e-app"],
      reason: "Isolated recorder acceptance fixture",
    })
    const project = projectCall.structuredContent?.project
    context.projectId = project?.id
    check("write MCP 创建并绑定 E2E App/e2e-app", isSuccessToolCall(projectCall) && project?.name === "E2E App" && Array.isArray(project.directories) && project.directories.includes("e2e-app"), callSummary(projectCall))

    const milestoneCall = await writeMcp.callTool("manage_project", {
      action: "add_milestone",
      project: "E2E App",
      title: "E2E Release 1.0",
      due: localDateKey(Date.now() + 14 * 86_400_000),
      reason: "Recorder briefing milestone fixture",
    })
    check("write MCP 给 E2E App 加待完成里程碑 E2E Release 1.0", isSuccessToolCall(milestoneCall) && milestoneCall.structuredContent?.milestone?.title === "E2E Release 1.0", callSummary(milestoneCall))

    const taskCall = await writeMcp.callTool("add_tasks", {
      tasks: [{ title: "E2E planned task", project: "E2E App", plannedFor: typeof today === "string" ? today : localDateKey(Date.now()), estimateMin: 25 }],
      reason: "Recorder taskSeq acceptance fixture",
    })
    const plannedTaskOutput = taskCall.structuredContent?.tasks?.[0]
    context.planSeq = taskCodeNumber(plannedTaskOutput?.code)
    if (!context.planSeq && context.projectId) {
      const snapshot = await getSnapshot(context.writeToken)
      const task = snapshot.ok ? currentData(snapshot, "task").find((item) => item.projectId === context.projectId && item.title === "E2E planned task") : null
      context.planSeq = Number.isSafeInteger(task?.seq) && task.seq > 0 ? task.seq : null
    }
    check("write MCP 创建今天计划任务并返回 T- 编号", isSuccessToolCall(taskCall) && Number.isSafeInteger(context.planSeq) && context.planSeq > 0, callSummary(taskCall))

    const bindings = await requestJson(BASE, "/api/recorder/bindings", { token: context.readToken })
    const binding = bindings.data?.bindings?.find((item) => item.dir === "e2e-app" && item.projectId === context.projectId)
    check("Worker bindings 包含 e2e-app 到 E2E App", bindings.status === 200 && Boolean(binding), jsonText({ status: bindings.status, binding, response: bindings.data }))

    endPhase("setup")
    const phaseApi = {
      check,
      currentPhase,
      root: ROOT,
      base: BASE,
      writeName: WRITE_NAME,
      claudeTimeoutMs: Math.min(CLAUDE_TIMEOUT_MS, remainingRunMs() - CLEANUP_RESERVE_MS - 60_000),
      commandDetail,
      jsonText,
      getSnapshot: (_base, token) => getSnapshot(token),
      currentData,
      snapshotSignature,
      uploadKeys,
      requestJson,
    }
    try {
      if (phaseApi.claudeTimeoutMs < 80_000) {
        await currentPhase("claude", async () => check("真实 Claude Code 第一段因 8 分钟总时限没有足够运行时间", false, `remaining=${remainingRunMs()}ms`, "claude"))
      } else {
        await runClaudePhase(context, phaseApi)
      }
    } catch (error) {
      check("真实 Claude Code 第一段未发生未处理异常", false, error instanceof Error ? error.stack ?? error.message : String(error), "claude")
    }
    try {
      await runSyntheticPhase(context, phaseApi)
    } catch (error) {
      check("人工事件第二段未发生未处理异常", false, error instanceof Error ? error.stack ?? error.message : String(error), "synthetic")
    }
  } catch (error) {
    if (phaseStarted.setup !== undefined && phaseTimes.setup === 0) endPhase("setup")
    check("验收环境准备与主流程", false, error instanceof Error ? error.stack ?? error.message : String(error), "setup")
  } finally {
    if (Date.now() >= runDeadline && !deadlineExceeded) {
      deadlineExceeded = true
      stopActiveProcesses()
    }
    clearTimeout(deadlineTimer)
    await cleanup()
    const elapsedMs = Date.now() - runStartedAt
    const withinLimit = !deadlineExceeded && elapsedMs <= MAX_RUN_MS
    check("整体验收在 8 分钟内结束", withinLimit, `elapsed=${elapsedMs}ms${deadlineExceeded ? "; action deadline triggered" : ""}`, "cleanup")
    printResults(elapsedMs)
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1
}

main().catch((error) => {
  check("脚本顶层异常", false, error instanceof Error ? error.stack ?? error.message : String(error))
  printResults()
  process.exitCode = 1
})
