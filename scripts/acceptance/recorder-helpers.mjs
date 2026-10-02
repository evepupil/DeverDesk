import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"

const OUTPUT_LIMIT = 300_000
const activeChildren = new Set()

function childEnvironment(source) {
  const env = { ...source }
  const noProxy = new Set(["127.0.0.1", "localhost"])
  for (const value of [env.NO_PROXY, env.no_proxy]) {
    for (const entry of String(value ?? "").split(",")) {
      const normalized = entry.trim()
      if (normalized) noProxy.add(normalized)
    }
  }
  const localBypass = [...noProxy].join(",")
  return { ...env, NO_PROXY: localBypass, no_proxy: localBypass }
}

function appendLimited(current, chunk) {
  const next = current + chunk.toString("utf8")
  return next.length > OUTPUT_LIMIT ? next.slice(-OUTPUT_LIMIT) : next
}

function resolveCommand(command, env) {
  if (existsSync(command)) return resolve(command)
  if (process.platform !== "win32") return command
  const lookup = spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true, env })
  if (lookup.status !== 0) return command
  return lookup.stdout.split(/\r?\n/).find((line) => line.trim())?.trim() ?? command
}

// .cmd / .bat 经 cmd.exe 运行（和 Node 写的宿主一样）。不经 PowerShell：PowerShell 创建的输出管道会被钩子留下的后台进程继承，
// 进程退出了管道还关不上（见本机记录器文档里 DEVERDESK_NO_DELAYED_SYNC 的说明）
function cmdQuote(value) {
  const text = String(value)
  return /[\s()&|<>^%!]/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text
}

function invocation(command, args, env) {
  const executable = resolveCommand(command, env)
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(executable)) {
    const line = [executable, ...args].map(cmdQuote).join(" ")
    return { command: "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], verbatim: true }
  }
  return { command: executable, args }
}

export function spawnProgram(command, args, options = {}) {
  const env = childEnvironment(options.env ?? process.env)
  const target = invocation(command, args, env)
  const child = spawn(target.command, target.args, {
    cwd: options.cwd,
    env,
    detached: options.detached ?? false,
    windowsHide: true,
    windowsVerbatimArguments: target.verbatim === true,
    stdio: ["pipe", "pipe", "pipe"],
  })
  activeChildren.add(child)
  child.once("close", () => activeChildren.delete(child))
  child.once("error", () => activeChildren.delete(child))
  return child
}

export function runCaptureSync(command, args, options = {}) {
  const env = childEnvironment(options.env ?? process.env)
  const target = invocation(command, args, env)
  const result = spawnSync(target.command, target.args, {
    cwd: options.cwd,
    env,
    input: options.input,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: OUTPUT_LIMIT * 2,
    windowsHide: true,
    windowsVerbatimArguments: target.verbatim === true,
  })
  return {
    code: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
    timedOut: result.error?.code === "ETIMEDOUT",
  }
}

export function runCapture(command, args, options = {}) {
  return new Promise((resolveResult) => {
    const child = spawnProgram(command, args, options)
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let settled = false
    let timer

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolveResult({
        ...result,
        stdout,
        stderr,
        timedOut,
        child,
      })
    }

    child.stdout?.on("data", (chunk) => { stdout = appendLimited(stdout, chunk) })
    child.stderr?.on("data", (chunk) => { stderr = appendLimited(stderr, chunk) })
    const startedAt = Date.now()
    let exitedAfterMs
    child.once("exit", () => { exitedAfterMs = Date.now() - startedAt })
    child.once("error", (error) => finish({ code: null, signal: null, error }))
    child.once("close", (code, signal) => finish({ code, signal, error: null, exitedAfterMs }))

    if (options.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true
        stopProcessTree(child)
        child.stdin?.destroy()
        child.stdout?.destroy()
        child.stderr?.destroy()
        // 进程早就退出了但管道一直没关：说明有别的进程拿着管道的写端（诊断用）
        const note = exitedAfterMs === undefined ? "child never exited" : `child exited after ${exitedAfterMs}ms but its pipes stayed open`
        finish({ code: null, signal: child.signalCode, error: new Error(`Timed out after ${options.timeoutMs}ms (${note})`), exitedAfterMs })
      }, options.timeoutMs)
    }
    child.stdin?.end(options.input ?? "")
  })
}

export function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === "win32") {
    const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      env: childEnvironment(process.env),
    })
    if (result.status === 0) return
  }
  try {
    if (process.platform === "win32") child.kill("SIGTERM")
    else process.kill(child.pid, "SIGTERM")
  } catch {
    // The process may have exited between the status check and signal.
  }
}

export function stopActiveProcesses() {
  for (const child of activeChildren) stopProcessTree(child)
}

export function stopProcessesInDirectory(directory) {
  if (process.platform !== "win32") return { stopped: [], error: null }
  const query = `
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class AcceptanceProcessQuery {
  [StructLayout(LayoutKind.Sequential)] struct BasicInfo { public IntPtr A; public IntPtr Peb; public IntPtr B; public IntPtr C; public IntPtr Pid; public IntPtr ParentPid; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr read);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int infoClass, ref BasicInfo info, int size, out int returned);
  static byte[] Read(IntPtr process, IntPtr address, int size) { var data = new byte[size]; UIntPtr read; return ReadProcessMemory(process, address, data, (UIntPtr)size, out read) ? data : null; }
  public static string Find(string directory) {
    var matches = new List<int>();
    if (IntPtr.Size != 8) return "";
    foreach (var item in Process.GetProcesses()) {
      IntPtr handle = OpenProcess(0x410, false, item.Id);
      if (handle == IntPtr.Zero) { item.Dispose(); continue; }
      try {
        var basic = new BasicInfo(); int returned;
        if (NtQueryInformationProcess(handle, 0, ref basic, Marshal.SizeOf(typeof(BasicInfo)), out returned) != 0) continue;
        var peb = Read(handle, basic.Peb, 0x30); if (peb == null) continue;
        var parameters = new IntPtr(BitConverter.ToInt64(peb, 0x20)); if (parameters == IntPtr.Zero) continue;
        var block = Read(handle, parameters, 0x48); if (block == null) continue;
        int length = BitConverter.ToUInt16(block, 0x38); IntPtr buffer = new IntPtr(BitConverter.ToInt64(block, 0x40));
        if (length < 2 || length > 4096 || buffer == IntPtr.Zero) continue;
        var data = Read(handle, buffer, length); if (data == null) continue;
        var cwd = Encoding.Unicode.GetString(data);
        if (cwd.Equals(directory, StringComparison.OrdinalIgnoreCase) || cwd.StartsWith(directory + System.IO.Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) matches.Add(item.Id);
      } catch {} finally { CloseHandle(handle); item.Dispose(); }
    }
    return string.Join(Environment.NewLine, matches);
  }
}
`
  const encodedQuery = Buffer.from(query, "utf8").toString("base64")
  const encodedDirectory = Buffer.from(resolve(directory), "utf16le").toString("base64")
  const command = `$query = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedQuery}')); Add-Type -TypeDefinition $query; $directory = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedDirectory}')); [AcceptanceProcessQuery]::Find($directory)`
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    env: childEnvironment(process.env),
  })
  if (result.status !== 0) {
    const error = result.error?.message || result.stderr.trim() || `process query exited ${result.status}`
    return { stopped: [], error }
  }
  const stopped = []
  const errors = []
  for (const value of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const pid = Number(value)
    if (!Number.isSafeInteger(pid) || pid === process.pid) continue
    const stop = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      env: childEnvironment(process.env),
    })
    if (stop.status === 0) stopped.push(pid)
    else errors.push(`${pid}: ${stop.stderr.trim() || stop.error?.message || `taskkill exited ${stop.status}`}`)
  }
  return { stopped, error: errors.length ? errors.join("; ") : null }
}

export function waitForChildClose(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolveResult) => {
    const timer = setTimeout(resolveResult, timeoutMs)
    child.once("close", () => {
      clearTimeout(timer)
      resolveResult()
    })
  })
}

export function sanitizeText(value, secrets = []) {
  let text = String(value ?? "")
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) text = text.replaceAll(secret, "[redacted]")
  }
  return text
}

export function jsonText(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function localEvent(kind, session, dir, cwd, t, extra = {}) {
  return { v: 1, kind, t, agent: "claude-code", session: session.replace(/^e2e-w([1-5])$/, "s$1"), dir, cwd, ...extra }
}

function commitEvent(session, dir, cwd, repo, t, subject, taskSeq) {
  const sha = randomBytes(20).toString("hex")
  const suffix = taskSeq === undefined ? "" : ` (Closes T-${taskSeq})`
  return {
    ...localEvent("commit", session, dir, cwd, t, {
      repo: repo.replace(/\\/g, "/"),
      sha,
      subject: `${subject}${suffix}`,
      additions: 30,
      deletions: 5,
      files: 2,
      authoredAt: t,
    }),
    sha,
  }
}

/** 把事件日志里 start 和 prompt 事件的时间往前挪 deltaMs（测试用：让一轮几十秒的真实会话够得上最小任务时长） */
function shiftSessionStartEvents(home, deltaMs) {
  const directory = join(home, "events")
  for (const name of readdirSync(directory).filter((item) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(item))) {
    const path = join(directory, name)
    const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
      const event = JSON.parse(line)
      if (event.kind === "start" || event.kind === "prompt") event.t -= deltaMs
      return JSON.stringify(event)
    })
    writeFileSync(path, `${lines.join("\n")}\n`, "utf8")
  }
}

function recorderEvents(home) {
  const directory = join(home, "events")
  let names
  try {
    names = readdirSync(directory).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
  } catch {
    return []
  }
  const events = []
  for (const name of names) {
    try {
      for (const line of readFileSync(join(directory, name), "utf8").split(/\r?\n/)) {
        if (!line) continue
        try {
          events.push(JSON.parse(line))
        } catch {
          // Ignore a malformed line without discarding other recorded events.
        }
      }
    } catch {
      // Keep valid event files when an unrelated file cannot be read.
    }
  }
  return events
}

function writeSyntheticEvents(home, events) {
  const directory = join(home, "events")
  mkdirSync(directory, { recursive: true })
  const grouped = new Map()
  for (const event of events) {
    const eventDate = new Date(event.t)
    const date = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, "0")}-${String(eventDate.getDate()).padStart(2, "0")}`
    const list = grouped.get(date) ?? []
    list.push(event)
    grouped.set(date, list)
  }
  for (const [date, list] of grouped) {
    writeFileSync(join(directory, `${date}.jsonl`), `${list.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8")
  }
}

function clearLocalRecorderData(home) {
  const eventsDir = join(home, "events")
  if (existsSync(eventsDir)) {
    for (const name of readdirSync(eventsDir)) {
      if (name.endsWith(".jsonl")) rmSync(join(eventsDir, name), { force: true })
    }
  }
  for (const name of ["uploaded.jsonl", "state.json", "bindings.json"]) rmSync(join(home, name), { force: true })
}

function recorderCommand(ctx, args, options = {}) {
  const available = ctx.remainingRunMs ? ctx.remainingRunMs() - (ctx.cleanupReserveMs ?? 0) : Infinity
  if (available <= 0) {
    return Promise.resolve({ code: null, signal: null, stdout: "", stderr: "", error: new Error("8-minute acceptance deadline reached"), timedOut: true })
  }
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 45_000, available))
  return runCapture(process.execPath, [ctx.recorderBin, ...args], { ...options, timeoutMs })
}

async function syncWithRetry(ctx, now) {
  const args = ["sync", ...(now === undefined ? [] : ["--now", String(now)])]
  let result
  for (let attempt = 0; attempt < 5; attempt += 1) {
    result = await recorderCommand(ctx, args, { cwd: ctx.projectDir, env: ctx.recorderEnv })
    if (!result.stdout.includes("同步已在运行")) return result
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))
  }
  return result
}

function authenticationFailure(result) {
  return /failed to authenticate|oauth session expired|not logged in|login required|authentication.{0,30}(expired|failed)|invalid api key/i
    .test(`${result.stdout}\n${result.stderr}`)
}

export async function runClaudePhase(ctx, api) {
  const { check, currentPhase, root, base, writeName, claudeTimeoutMs, commandDetail,
    jsonText, getSnapshot, currentData, requestJson } = api
  return currentPhase("claude", async () => {
    if (process.env.E2E_SKIP_CLAUDE === "1") {
      check("真实 Claude Code 会话按 E2E_SKIP_CLAUDE 跳过", true, "first segment skipped", "claude")
      return
    }
    if (!ctx.projectDir || !ctx.writeToken) {
      check("真实 Claude Code 阶段具备项目和写入令牌", false, "setup did not produce the required resources", "claude")
      return
    }

    // 提示要简单确定：让模型等一个长命令不可靠（它会把命令放后台然后直接结束这一轮），所以不等；
    // 为了让这一轮的计入时间超过引擎的最小任务时长（1 分钟），拿到真实事件后把「开始」和「发话」的时间往前挪 2 分钟再同步
    const prompt = 'Create a file named hello.txt containing the single word hi, run git add hello.txt, then run git commit -m "feat: add hello file". Finally reply with the single word done.'
    // 提示通过标准输入给：命令行里的引号会被 Windows 的 claude.cmd 拆坏，--allowedTools 也会吞掉后面的位置参数
    const result = await runCapture("claude.cmd", [
      "-p",
      "--model", "haiku",
      "--plugin-dir", join(root, "integrations", "claude-code"),
      "--no-session-persistence",
      "--setting-sources", "project",
      "--permission-mode", "acceptEdits",
      "--permission-prompts", "none",
      "--allowedTools", "Write", "Bash(git add:*)", "Bash(git commit:*)",
      "--max-budget-usd", "1",
    ], { cwd: ctx.projectDir, env: ctx.claudeEnv, timeoutMs: claudeTimeoutMs, input: prompt })
    const authFailed = authenticationFailure(result)
    check("真实 Claude Code 插件会话正常结束", result.code === 0 && !authFailed, commandDetail(result), "claude")
    if (authFailed) check("Claude Code 认证可用", false, "authentication failure matched Claude CLI output", "claude")

    const helloPath = join(ctx.projectDir, "hello.txt")
    const hello = existsSync(helloPath) ? readFileSync(helloPath, "utf8").trim() : ""
    check("Claude 在隔离仓库创建 hello.txt", hello === "hi", `content=${JSON.stringify(hello)}`, "claude")
    const commit = runCaptureSync("git.exe", ["-C", ctx.projectDir, "log", "-1", "--format=%H%n%s"], { cwd: ctx.projectDir, timeoutMs: 15_000 })
    const [sha = "", subject = ""] = commit.stdout.trim().split(/\r?\n/)
    const commitSha = sha.slice(0, 7).toLowerCase()
    check("Claude 提交标题和短 SHA 符合验收内容", commit.code === 0 && subject === "feat: add hello file" && /^[0-9a-f]{7}$/.test(commitSha), commandDetail(commit), "claude")

    const events = recorderEvents(ctx.home)
    const sessionEvents = events.filter((event) => event.agent === "claude-code")
    const kinds = new Set(sessionEvents.map((event) => event.kind))
    const requiredKinds = ["start", "prompt", "stop", "commit"]
    check("Claude 钩子记录 start、prompt、stop 和 commit", requiredKinds.every((kind) => kinds.has(kind)), jsonText({ events }), "claude")
    const targetSession = sessionEvents.find((event) => event.kind === "start")?.session
    const relevantEvents = sessionEvents.filter((event) => requiredKinds.includes(event.kind))
    const oneSession = targetSession !== undefined && relevantEvents.every((event) => event.session === targetSession)
    const normalized = events.length > 0 && events.every((event) => event.agent === "claude-code" && event.dir === "e2e-app" && event.cwd === ctx.projectDir)
    const recordedCommit = sessionEvents.find((event) => event.kind === "commit" && event.sha?.startsWith(commitSha))
    check("Claude 事件使用同一会话、claude-code 和 e2e-app", oneSession && normalized, jsonText(sessionEvents), "claude")
    check("Claude commit 事件包含仓库、标题和短 SHA", Boolean(recordedCommit && recordedCommit.subject === subject && recordedCommit.repo?.replace(/\\/g, "/").endsWith("/e2e-app") && recordedCommit.sha.slice(0, 7) === commitSha), jsonText(recordedCommit), "claude")

    if (result.code !== 0 || authFailed) {
      check("真实 Claude 会话失败，未能完成上传及撤销链路", false, `Claude 原始输出：\n${commandDetail(result)}\n事件文件内容：\n${jsonText(events)}`, "claude")
      return
    }

    shiftSessionStartEvents(ctx.home, 120_000)
    const syncResult = await syncWithRetry(ctx, Date.now() + 20 * 60_000)
    const syncedOneTask = syncResult.code === 0 && /同步完成：上传 1 个任务、\d+ 段投入/.test(syncResult.stdout)
    check("真实 Claude 会话事件通过记录器同步一项任务", syncedOneTask, commandDetail(syncResult), "claude")
    const snapshot = await getSnapshot(base, ctx.writeToken)
    const tasks = snapshot.ok ? currentData(snapshot, "task") : []
    const entries = snapshot.ok ? currentData(snapshot, "entry") : []
    const realTask = tasks.find((task) => task.projectId === ctx.projectId && task.title === "add hello file" && task.notes?.toLowerCase().includes(commitSha))
    check("Worker 存在已完成的 coding 任务并附带提交短 SHA", snapshot.ok && Boolean(realTask && realTask.status === "done" && realTask.origin === "coding"), jsonText({ task: realTask, snapshotError: snapshot.error }), "claude")
    const realEntries = realTask ? entries.filter((entry) => entry.taskId === realTask.id && entry.projectId === ctx.projectId) : []
    check("Claude 任务至少有一段 coding 时间记录", realEntries.length > 0 && realEntries.every((entry) => entry.origin === "coding" && entry.minutes >= 1), jsonText(realEntries), "claude")

    const changesetsResponse = await requestJson(base, "/api/ai/changesets?status=all&limit=50", { cookie: ctx.cookie })
    const changesets = changesetsResponse.data?.changesets ?? []
    const recorderChangeset = changesets.find((item) => item.clientName === writeName && item.tool === "recorder" && item.status === "applied")
    check("记录器上传生成 applied AI changeset", changesetsResponse.status === 200 && Boolean(recorderChangeset), jsonText({ status: changesetsResponse.status, changesets }), "claude")
    let undoResponse = null
    if (recorderChangeset?.id) undoResponse = await requestJson(base, `/api/ai/changesets/${encodeURIComponent(recorderChangeset.id)}/undo`, { method: "POST", cookie: ctx.cookie, body: {} })
    const undoOk = undoResponse?.status === 200 && undoResponse.data?.changeset?.status === "undone" && undoResponse.data.conflicts?.length === 0
    check("用户会话撤销记录器 changeset", undoOk, jsonText(undoResponse?.data ?? { status: undoResponse?.status ?? "not called" }), "claude")

    const afterUndo = await getSnapshot(base, ctx.writeToken)
    const remainingTasks = afterUndo.ok ? currentData(afterUndo, "task") : []
    const remainingEntries = afterUndo.ok ? currentData(afterUndo, "entry") : []
    const taskGone = !remainingTasks.some((task) => task.projectId === ctx.projectId && task.title === "add hello file" && task.notes?.toLowerCase().includes(commitSha))
    const entriesGone = !realTask || !remainingEntries.some((entry) => entry.taskId === realTask.id)
    check("撤销后记录器任务和时间段已从 Worker 移除", afterUndo.ok && taskGone && entriesGone, jsonText({ taskStillPresent: !taskGone, snapshotError: afterUndo.error }), "claude")
    const status = await recorderCommand(ctx, ["status", "--json"], { cwd: ctx.projectDir, env: ctx.recorderEnv })
    let statusData = null
    try { statusData = JSON.parse(status.stdout) } catch { /* Preserve stdout in the assertion. */ }
    check("status --json 显示最近同步成功且 e2e-app 已绑定", status.code === 0 && statusData?.bound === true && statusData.project?.name === "E2E App" && statusData.lastSync?.ok === true, status.stdout || commandDetail(status), "claude")
  })
}

export async function runSyntheticPhase(ctx, api) {
  const { check, currentPhase, base, commandDetail, jsonText, getSnapshot, currentData,
    snapshotSignature, uploadKeys, requestJson } = api
  return currentPhase("synthetic", async () => {
    if (!ctx.projectDir || !ctx.projectId || !ctx.writeToken || !ctx.readToken) {
      check("人工事件阶段具备项目及 read/write 令牌", false, "setup did not produce the required resources", "synthetic")
      return
    }
    clearLocalRecorderData(ctx.home)
    const now = Date.now()
    const origin = Math.floor((now - 3 * 60 * 60_000) / 60_000) * 60_000
    const appCwd = ctx.projectDir
    const unboundCwd = ctx.unboundDir
    const appRepo = ctx.projectDir.replace(/\\/g, "/")
    const unboundRepo = ctx.unboundDir.replace(/\\/g, "/")
    const planSeq = ctx.planSeq ?? -1
    const w1Commit = commitEvent("e2e-w1", "e2e-app", appCwd, appRepo, origin + 25 * 60_000, "fix: handle retries", planSeq)
    const w4Commit = commitEvent("e2e-w4", "unbound-app", unboundCwd, unboundRepo, origin + 35 * 60_000, "feat: should never be uploaded")
    const w5PromptAt = Math.floor((now - 2 * 60_000) / 60_000) * 60_000
    const events = [
      localEvent("prompt", "e2e-w1", "e2e-app", appCwd, origin, { text: "Handle the planned retry work." }),
      localEvent("stop", "e2e-w1", "e2e-app", appCwd, origin + 10 * 60_000),
      localEvent("prompt", "e2e-w1", "e2e-app", appCwd, origin + 12 * 60_000, { text: "Finish the planned retry work." }),
      w1Commit,
      localEvent("stop", "e2e-w1", "e2e-app", appCwd, origin + 25 * 60_000),
      localEvent("prompt", "e2e-w2", "e2e-app", appCwd, origin + 60 * 60_000, { text: "Parallel fixture W2." }),
      localEvent("stop", "e2e-w2", "e2e-app", appCwd, origin + 70 * 60_000),
      localEvent("prompt", "e2e-w2", "e2e-app", appCwd, origin + 70 * 60_000, { text: "Continue parallel fixture W2." }),
      localEvent("stop", "e2e-w2", "e2e-app", appCwd, origin + 80 * 60_000),
      localEvent("end", "e2e-w2", "e2e-app", appCwd, origin + 80 * 60_000, { reason: "other" }),
      localEvent("prompt", "e2e-w3", "e2e-app", appCwd, origin + 65 * 60_000, { text: "Parallel fixture W3." }),
      localEvent("stop", "e2e-w3", "e2e-app", appCwd, origin + 75 * 60_000),
      localEvent("prompt", "e2e-w3", "e2e-app", appCwd, origin + 75 * 60_000, { text: "Continue parallel fixture W3." }),
      localEvent("stop", "e2e-w3", "e2e-app", appCwd, origin + 85 * 60_000),
      localEvent("end", "e2e-w3", "e2e-app", appCwd, origin + 85 * 60_000, { reason: "other" }),
      localEvent("start", "e2e-w4", "unbound-app", unboundCwd, origin + 30 * 60_000, { source: "startup" }),
      localEvent("prompt", "e2e-w4", "unbound-app", unboundCwd, origin + 30 * 60_000, { text: "Unbound fixture must stay local." }),
      localEvent("stop", "e2e-w4", "unbound-app", unboundCwd, origin + 40 * 60_000),
      w4Commit,
      localEvent("prompt", "e2e-w5", "e2e-app", appCwd, w5PromptAt, { text: "Still working in the live window." }),
    ]
    writeSyntheticEvents(ctx.home, events)
    const writtenEvents = recorderEvents(ctx.home)
    check("五组人工事件写入临时 DEVERDESK_HOME", writtenEvents.length === events.length, `expected=${events.length}, actual=${writtenEvents.length}`, "synthetic")

    const futureNow = now + 20 * 60_000
    const firstSync = await syncWithRetry(ctx, futureNow)
    check("人工事件首次 sync --now 成功", firstSync.code === 0 && firstSync.stdout.includes("同步完成："), commandDetail(firstSync), "synthetic")
    const firstSnapshot = await getSnapshot(base, ctx.writeToken)
    const firstTasks = firstSnapshot.ok ? currentData(firstSnapshot, "task") : []
    const firstEntries = firstSnapshot.ok ? currentData(firstSnapshot, "entry") : []
    const plannedTask = firstTasks.find((task) => task.projectId === ctx.projectId && task.seq === ctx.planSeq)
    const plannedEntries = plannedTask ? firstEntries.filter((entry) => entry.taskId === plannedTask.id && entry.projectId === ctx.projectId) : []
    const plannedOk = firstSnapshot.ok && Boolean(plannedTask && plannedTask.status === "done" && plannedEntries.length > 0 && plannedEntries.every((entry) => entry.origin === "coding"))
    check("W1 通过 taskSeq 完成计划任务并关联 coding 投入", plannedOk, jsonText({ task: plannedTask, entries: plannedEntries, snapshotError: firstSnapshot.error }), "synthetic")
    const plannedMinutes = plannedEntries.reduce((total, entry) => total + entry.minutes, 0)
    check("W1 计划任务投入约 25 分钟", plannedMinutes >= 23 && plannedMinutes <= 27, jsonText({ minutes: plannedMinutes, entries: plannedEntries }), "synthetic")

    const parallelTasks = firstTasks.filter((task) => task.projectId === ctx.projectId && task.origin === "coding" && task.id !== plannedTask?.id && task.completedAt >= origin + 60 * 60_000 && task.completedAt <= origin + 90 * 60_000)
    const parallelIds = new Set(parallelTasks.map((task) => task.id))
    const parallelEntries = firstEntries.filter((entry) => parallelIds.has(entry.taskId) && entry.projectId === ctx.projectId)
    const parallelMinutes = parallelEntries.reduce((total, entry) => total + entry.minutes, 0)
    check("W2/W3 各自生成已到站的 coding 任务", parallelTasks.length === 2, jsonText({ tasks: parallelTasks, snapshotError: firstSnapshot.error }), "synthetic")
    check("W2/W3 并行投入分摊后合计约 25 分钟", parallelMinutes >= 23 && parallelMinutes <= 27 && parallelEntries.every((entry) => entry.origin === "coding"), jsonText({ minutes: parallelMinutes, entries: parallelEntries }), "synthetic")

    const leakedUnboundTask = firstTasks.find((task) => task.title?.includes("should never be uploaded"))
    const leakedUnboundRecords = firstSnapshot.ok ? [...firstSnapshot.latest.values()].filter((record) => JSON.stringify(record.data).includes("unbound-app")) : []
    check("W4 unbound-app 事件没有生成或上传任务或记录", firstSnapshot.ok && !leakedUnboundTask && leakedUnboundRecords.length === 0, jsonText({ leakedTask: leakedUnboundTask, leakedRecords: leakedUnboundRecords }), "synthetic")
    const firstUploadedKeys = uploadKeys(ctx.home)
    check("本机 uploaded.jsonl 记录了幂等键", firstUploadedKeys.length > 0 && firstUploadedKeys.every((item) => typeof item.k === "string"), jsonText(firstUploadedKeys), "synthetic")
    const firstSignature = firstSnapshot.ok ? snapshotSignature(firstSnapshot) : ""

    const repeatedSync = await syncWithRetry(ctx, futureNow)
    const repeatedSnapshot = await getSnapshot(base, ctx.writeToken)
    const repeatedIdempotent = repeatedSync.code === 0 && /同步完成：上传 0 个任务/.test(repeatedSync.stdout) && repeatedSnapshot.ok && snapshotSignature(repeatedSnapshot) === firstSignature
    check("相同 --now 重复同步上传 0 个任务且 Worker 记录不变", repeatedIdempotent, jsonText({ sync: commandDetail(repeatedSync), before: firstSignature, after: repeatedSnapshot.ok ? snapshotSignature(repeatedSnapshot) : repeatedSnapshot.error }), "synthetic")

    rmSync(join(ctx.home, "uploaded.jsonl"), { force: true })
    const rebuiltSync = await syncWithRetry(ctx, futureNow)
    const rebuiltSnapshot = await getSnapshot(base, ctx.writeToken)
    const rebuiltKeys = uploadKeys(ctx.home)
    const serverStable = firstSnapshot.ok && rebuiltSnapshot.ok && snapshotSignature(rebuiltSnapshot) === firstSignature
    check("删除 uploaded.jsonl 后重传仍不增加 Worker 记录", rebuiltSync.code === 0 && serverStable, jsonText({ sync: commandDetail(rebuiltSync), before: firstSignature, after: rebuiltSnapshot.ok ? snapshotSignature(rebuiltSnapshot) : rebuiltSnapshot.error }), "synthetic")
    check("重复上传后本机重新写回 uploaded.jsonl", rebuiltKeys.length > 0, jsonText(rebuiltKeys), "synthetic")

    const realNowSync = await syncWithRetry(ctx)
    check("真实现在不带 --now 再同步成功", realNowSync.code === 0 && realNowSync.stdout.includes("同步完成："), commandDetail(realNowSync), "synthetic")
    const liveResponse = await requestJson(base, "/api/recorder/live", { token: ctx.writeToken })
    const liveWindow = liveResponse.data?.windows?.find((window) => window.session === "s5")
    check("W5 live 窗口显示 E2E App 且至少 1 分钟", liveResponse.status === 200 && liveResponse.data?.windows?.length === 1 && Boolean(liveWindow && liveWindow.projectName === "E2E App" && liveWindow.minutes >= 1), jsonText({ status: liveResponse.status, window: liveWindow, response: liveResponse.data }), "synthetic")

    const bindingsRead = await requestJson(base, "/api/recorder/bindings", { token: ctx.readToken })
    const binding = bindingsRead.data?.bindings?.find((item) => item.dir === "e2e-app" && item.projectId === ctx.projectId)
    check("read 令牌可以读取目录绑定", bindingsRead.status === 200 && Boolean(binding), jsonText({ status: bindingsRead.status, binding, response: bindingsRead.data }), "synthetic")
    const deniedUpload = await requestJson(base, "/api/recorder/upload", { method: "POST", token: ctx.readToken, body: {} })
    check("read 令牌上传请求返回 403", deniedUpload.status === 403, jsonText({ status: deniedUpload.status, response: deniedUpload.data ?? deniedUpload.text }), "synthetic")
    const deniedLiveWrite = await requestJson(base, "/api/recorder/live", { method: "PUT", token: ctx.readToken, body: { windows: [] } })
    check("read 令牌写入 live 请求返回 403", deniedLiveWrite.status === 403, jsonText({ status: deniedLiveWrite.status, response: deniedLiveWrite.data ?? deniedLiveWrite.text }), "synthetic")

    const hookInput = (session, cwd) => JSON.stringify({ session_id: session, cwd, hook_event_name: "SessionStart", source: "startup" })
    const boundHook = await recorderCommand(ctx, ["hook", "claude-code", "SessionStart"], { cwd: ctx.projectDir, env: ctx.recorderEnv, timeoutMs: 15_000, input: hookInput("e2e-briefing-bound", ctx.projectDir) })
    let boundData = null
    try { boundData = JSON.parse(boundHook.stdout) } catch { /* Assert the documented JSON envelope below. */ }
    const boundContext = boundData?.hookSpecificOutput?.additionalContext ?? ""
    check("SessionStart 简报 JSON 包含绑定项目 E2E App", boundHook.code === 0 && boundContext.includes("E2E App"), commandDetail(boundHook), "synthetic")
    const unboundHook = await recorderCommand(ctx, ["hook", "claude-code", "SessionStart"], { cwd: ctx.unboundDir, env: ctx.recorderEnv, timeoutMs: 15_000, input: hookInput("e2e-briefing-unbound", ctx.unboundDir) })
    let unboundData = null
    try { unboundData = JSON.parse(unboundHook.stdout) } catch { /* Assert the unbound behavior below. */ }
    const unboundContext = unboundData?.hookSpecificOutput?.additionalContext ?? ""
    check("未绑定目录的 SessionStart JSON 不出现 E2E App", unboundHook.code === 0 && !unboundContext.includes("E2E App"), commandDetail(unboundHook), "synthetic")
  })
}

export function splitPath(path, env = process.env) {
  return path.split(delimiter).filter(Boolean).join(delimiter) + (env.PATH ? `${delimiter}${env.PATH}` : "")
}
