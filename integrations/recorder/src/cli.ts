import { spawn } from "node:child_process"
import { resolveDirName } from "./git/resolve-project"
import { createGitRunner } from "./git/runner"
import { recorderHome } from "./store/paths"
import { appendEvent, readEvents } from "./store/event-log"
import { runBackfill, type BackfillOptionsInput } from "./commands/backfill"
import { runDoctor } from "./commands/doctor"
import { runDone, type DoneOptions } from "./commands/done"
import { runHook, appendRecorderLog, type HookInput } from "./commands/hook"
import { runSetup, type SetupOptions } from "./commands/setup"
import { runStatus } from "./commands/status"
import { runSyncCommand, type SyncCommandOptions } from "./commands/sync"
import { runTasks } from "./commands/tasks"
import type { Agent } from "./core/types"

export const VERSION = "0.1.0"

export interface CliIO {
  stdin?: string | AsyncIterable<string | Uint8Array>
  stdout: { write(value: string): unknown }
  stderr: { write(value: string): unknown }
}

export interface CliHandlers {
  hook?(input: HookInput): Promise<{ stdout?: string }>
  sync?(options: SyncCommandOptions, env: Record<string, string | undefined>, now?: number): Promise<string>
  status?(options: { json: boolean }, env: Record<string, string | undefined>, now?: number): Promise<string>
  done?(options: DoneOptions, env: Record<string, string | undefined>, now?: number): Promise<string>
  tasks?(options: { since: string; json: boolean }, env: Record<string, string | undefined>, now?: number): Promise<string>
  setup?(options: SetupOptions, env: Record<string, string | undefined>): Promise<string>
  backfill?(options: BackfillOptionsInput, env: Record<string, string | undefined>, now?: number): Promise<string>
  doctor?(env: Record<string, string | undefined>, now?: number): Promise<string>
}

const USAGE = [
  "用法：deverdesk-recorder <命令> [参数]",
  "  hook <claude-code|codex> <事件>       处理宿主钩子",
  "  sync [--all] [--dry-run] [--days 60] [--delay 毫秒]",
  "  status [--json]",
  "  done \"标题\" [--session <id>] [--agent claude-code|codex]",
  "  tasks [--since 7d] [--json]",
  "  setup --url <地址> --token <令牌> [--install-codex-hooks]",
  "  backfill [--agent claude-code|codex|all] [--days 30] [--dry-run]",
  "  doctor | --version | --help",
].join("\n")

function cliError(message: string, exitCode = 2): Error & { exitCode: number } {
  return Object.assign(new Error(message), { exitCode })
}

function positiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value)
  if (!value || !/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || parsed < 1) throw cliError(`${name} 必须是正整数`)
  return parsed
}

function nonnegativeInteger(value: string | undefined, name: string): number {
  const parsed = Number(value)
  if (!value || !/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || parsed < 0) throw cliError(`${name} 必须是非负整数`)
  return parsed
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) throw cliError(`${flag} 后需要一个值`)
  return value
}

async function readStdin(source: CliIO["stdin"]): Promise<string> {
  if (typeof source === "string") return source
  if (!source) return ""
  let text = ""
  let timer: NodeJS.Timeout | undefined
  const consume = (async () => {
    for await (const chunk of source) text += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
    return text
  })()
  const timedOut = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      const destroy = (source as AsyncIterable<string | Uint8Array> & { destroy?: () => void }).destroy
      destroy?.call(source)
      resolve(text)
    }, 3_000)
  })
  try {
    return await Promise.race([consume, timedOut])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function writeLine(stream: CliIO["stdout"] | CliIO["stderr"], value: string): void {
  stream.write(`${value}${value.endsWith("\n") ? "" : "\n"}`)
}

function parseHiddenNow(args: string[]): { args: string[]; now?: number } {
  const visible = [...args]
  let now: number | undefined
  for (let index = 0; index < visible.length; index += 1) {
    if (visible[index] !== "--now") continue
    const raw = visible[index + 1]
    const parsed = Number(raw)
    if (!raw || !Number.isSafeInteger(parsed)) throw cliError("--now 必须是毫秒时间戳")
    now = parsed
    visible.splice(index, 2)
    index -= 1
  }
  return { args: visible, ...(now === undefined ? {} : { now }) }
}

async function defaultStatus(options: { json: boolean }, env: Record<string, string | undefined>, now?: number): Promise<string> {
  const git = createGitRunner()
  const result = await runStatus(options, {
    cwd: process.cwd(),
    home: recorderHome(env),
    env,
    now,
    resolveDirName: (cwd) => resolveDirName(cwd, git),
  })
  return result.output
}

async function defaultDone(options: DoneOptions, env: Record<string, string | undefined>, now?: number): Promise<string> {
  const git = createGitRunner()
  const script = process.argv[1] ?? ""
  return runDone(options, {
    home: recorderHome(env),
    cwd: process.cwd(),
    env,
    now,
    resolveDirName: (cwd) => resolveDirName(cwd, git),
    readEvents,
    appendEvent,
    spawnBackgroundSync: () => {
      const child = spawn(process.execPath, [script, "sync"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...env, DEVERDESK_RECORDER_INTERNAL: "1" },
      })
      child.unref()
    },
  })
}

async function defaultSetup(options: SetupOptions, env: Record<string, string | undefined>): Promise<string> {
  return runSetup(options, { env, home: recorderHome(env), cliPath: process.argv[1] ?? "" })
}

async function defaultBackfill(options: BackfillOptionsInput, env: Record<string, string | undefined>, now?: number): Promise<string> {
  return runBackfill(options, { env, home: recorderHome(env), now })
}

async function defaultDoctor(env: Record<string, string | undefined>, now?: number): Promise<string> {
  return (await runDoctor({ env, home: recorderHome(env), now })).output
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  io: CliIO = { stdin: process.stdin as AsyncIterable<Uint8Array>, stdout: process.stdout, stderr: process.stderr },
  handlers: CliHandlers = {},
): Promise<number> {
  if (argv.includes("--help") || argv.length === 0) {
    writeLine(io.stdout, USAGE)
    return 0
  }
  if (argv[0] === "--version") {
    writeLine(io.stdout, VERSION)
    return 0
  }
  let command: string
  let rawArgs: string[]
  let now: number | undefined
  try {
    command = argv[0] ?? ""
    const hidden = parseHiddenNow(argv.slice(1))
    rawArgs = hidden.args
    now = hidden.now
  } catch (error) {
    writeLine(io.stderr, error instanceof Error ? error.message : String(error))
    return 2
  }

  if (command === "hook") {
    try {
      const [agent, eventName, ...tail] = rawArgs
      if ((agent !== "claude-code" && agent !== "codex") || !eventName) return 0
      const stdin = await readStdin(io.stdin)
      const payload = stdin.trim() ? stdin : tail.at(-1) ?? ""
      const agentName = agent === "claude-code" ? "claude-code" : "codex"
      const result = await (handlers.hook ?? runHook)({
        agent: agentName,
        eventName,
        input: payload,
        env,
        ...(now === undefined ? {} : { now }),
      })
      if (eventName === "SessionStart" && result.stdout) writeLine(io.stdout, result.stdout)
    } catch {
      // Hook errors are intentionally invisible to the host application.
    }
    return 0
  }

  if (!["sync", "status", "done", "tasks", "setup", "backfill", "doctor"].includes(command)) {
    writeLine(io.stderr, `${USAGE}\n未知命令：${command}`)
    return 2
  }

  try {
    let output = ""
    if (command === "sync") {
      let all = false
      let dryRun = false
      let days: number | undefined
      let delayMs: number | undefined
      for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index]
        if (arg === "--all") all = true
        else if (arg === "--dry-run") dryRun = true
        else if (arg === "--days") days = positiveInteger(readValue(rawArgs, index++, arg), "--days")
        else if (arg === "--delay") delayMs = nonnegativeInteger(readValue(rawArgs, index++, arg), "--delay")
        else throw cliError(`sync 不认识参数：${arg}`)
      }
      output = await (handlers.sync ?? ((options, values, timestamp) => runSyncCommand(options, { env: values, now: timestamp, scriptPath: process.argv[1] })))(
        { all, dryRun, ...(days === undefined ? {} : { days }), ...(delayMs === undefined ? {} : { delayMs }) }, env, now)
    } else if (command === "status") {
      const json = rawArgs.includes("--json")
      if (rawArgs.some((arg) => arg !== "--json")) throw cliError("status 不认识该参数")
      output = await (handlers.status ?? defaultStatus)({ json }, env, now)
    } else if (command === "done") {
      let title: string | undefined
      let session: string | undefined
      let agent: Agent | undefined
      for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index]
        if (arg === "--session") session = readValue(rawArgs, index++, arg)
        else if (arg === "--agent") {
          const value = readValue(rawArgs, index++, arg)
          if (value !== "claude-code" && value !== "codex") throw cliError("--agent 只能是 claude-code 或 codex")
          agent = value
        } else if (arg?.startsWith("--") || title !== undefined) throw cliError(`done 参数无效：${arg}`)
        else title = arg
      }
      if (title === undefined || !title.trim()) throw cliError("done 需要一个非空标题")
      output = await (handlers.done ?? defaultDone)({ title, ...(session ? { session } : {}), ...(agent ? { agent } : {}) }, env, now)
    } else if (command === "tasks") {
      let since = "7d"
      let json = false
      for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index]
        if (arg === "--since") since = readValue(rawArgs, index++, arg)
        else if (arg === "--json") json = true
        else throw cliError(`tasks 不认识参数：${arg}`)
      }
      output = await (handlers.tasks ?? (async (options, values, timestamp) => (await runTasks(options, { home: recorderHome(values), now: timestamp })).output))({ since, json }, env, now)
    } else if (command === "setup") {
      let url: string | undefined
      let token: string | undefined
      let installCodexHooks = false
      for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index]
        if (arg === "--url") url = readValue(rawArgs, index++, arg)
        else if (arg === "--token") token = readValue(rawArgs, index++, arg)
        else if (arg === "--install-codex-hooks") installCodexHooks = true
        else throw cliError(`setup 不认识参数：${arg}`)
      }
      if (url === undefined || token === undefined) throw cliError("setup 需要 --url 和 --token")
      output = await (handlers.setup ?? defaultSetup)({ url, token, installCodexHooks }, env)
    } else if (command === "backfill") {
      let agent: BackfillOptionsInput["agent"] = "all"
      let days = 30
      let dryRun = false
      for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index]
        if (arg === "--agent") {
          const value = readValue(rawArgs, index++, arg)
          if (value !== "claude-code" && value !== "codex" && value !== "all") throw cliError("--agent 只能是 claude-code、codex 或 all")
          agent = value
        } else if (arg === "--days") days = positiveInteger(readValue(rawArgs, index++, arg), "--days")
        else if (arg === "--dry-run") dryRun = true
        else throw cliError(`backfill 不认识参数：${arg}`)
      }
      output = await (handlers.backfill ?? defaultBackfill)({ agent, days, dryRun }, env, now)
    } else {
      if (rawArgs.length) throw cliError("doctor 不接受参数")
      output = await (handlers.doctor ?? defaultDoctor)(env, now)
    }
    writeLine(io.stdout, output)
    return 0
  } catch (error) {
    writeLine(io.stderr, error instanceof Error ? error.message : String(error))
    return typeof error === "object" && error !== null && "exitCode" in error && error.exitCode === 2 ? 2 : 1
  }
}

if (require.main === module) {
  const hookCommand = process.argv[2] === "hook"
  const hookEventName = hookCommand ? process.argv[4] : undefined
  const fatalHook = (error: unknown): void => {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error)
    appendRecorderLog(recorderHome(), `Uncaught hook failure: ${detail}`)
    process.exitCode = 0
  }
  if (hookCommand) {
    const watchdog = setTimeout(() => process.exit(0), hookEventName === "SessionEnd" ? 2500 : 4000)
    watchdog.unref()
    process.on("uncaughtException", fatalHook)
    process.on("unhandledRejection", fatalHook)
  }
  void main(process.argv.slice(2)).then(
    (code) => { process.exitCode = hookCommand ? 0 : code },
    (error: unknown) => {
      if (hookCommand) {
        fatalHook(error)
        return
      }
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`, () => { process.exitCode = 1 })
    },
  )
}
