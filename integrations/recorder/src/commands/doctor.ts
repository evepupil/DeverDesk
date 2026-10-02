import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { LiveRequest, LiveWindow } from "../../../../src/sync/recorder-protocol"
import { LIVE_MAX_WINDOWS } from "../../../../src/sync/recorder-protocol"
import { dirNameKey } from "../../../../src/domain/dir-names"
import { computeTasks as computeTasksDefault } from "../core/engine"
import type { EngineResult, GitRunner, RecorderEvent } from "../core/types"
import { loadCredentials as loadCredentialsDefault, type Credentials } from "../store/config"
import { recorderHome } from "../store/paths"
import { createGitRunner } from "../git/runner"
import { readEvents as readEventsDefault } from "../store/event-log"
import { readState as readStateDefault, type RecorderState } from "../store/state"
import { createClient, RecorderHttpError, type RecorderClient } from "../upload/client"
import { managedRecorderPathFromCommand } from "./setup"

export interface DoctorCheck {
  status: "pass" | "warning" | "fail"
  label: string
  message: string
}

export interface DoctorDependencies {
  env: Record<string, string | undefined>
  home?: string
  now?: number
  nodeVersion?: string
  cwd?: string
  git?: GitRunner
  credentials?: Credentials | null
  loadCredentials?(home: string, env: Record<string, string | undefined>): Credentials | null
  readState?(home: string): RecorderState
  readEvents?(home: string, options: { now?: number }): RecorderEvent[]
  compute?(events: readonly RecorderEvent[], now: number): EngineResult
  client?: Pick<RecorderClient, "getBindings" | "putLive">
  createClient?(credentials: Credentials): Pick<RecorderClient, "getBindings" | "putLive">
  homeDir?: string
}

function eventLogBytes(home: string): number {
  let total = 0
  try {
    for (const name of readdirSync(join(home, "events"))) {
      if (name.endsWith(".jsonl")) total += statSync(join(home, "events", name)).size
    }
  } catch {
    return 0
  }
  return total
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function codexHookChecks(env: Record<string, string | undefined>, homeDir = homedir()): DoctorCheck[] {
  const configuredHome = env.CODEX_HOME?.trim()
  const codexHome = configuredHome || join(homeDir, ".codex")
  const hooksPath = join(codexHome, "hooks.json")
  if (!existsSync(hooksPath)) return []

  let source: unknown
  try {
    source = JSON.parse(readFileSync(hooksPath, "utf8")) as unknown
  } catch {
    return [{ status: "warning", label: "Codex 钩子", message: `无法解析：${hooksPath}` }]
  }
  if (!isRecord(source) || !isRecord(source.hooks)) return []

  const targets: { event: string; path: string }[] = []
  for (const [event, groups] of Object.entries(source.hooks)) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) continue
      for (const hook of group.hooks) {
        if (!isRecord(hook) || typeof hook.command !== "string") continue
        const path = managedRecorderPathFromCommand(hook.command)
        if (path) targets.push({ event, path })
      }
    }
  }
  if (targets.length === 0) return []

  const missing = targets.filter((target) => !isFile(target.path))
  if (missing.length > 0) {
    return missing.map(({ event, path }) => ({
      status: "fail",
      label: "Codex 钩子",
      message: `${event} 指向的文件不存在（${path}），重新运行 deverdesk-recorder setup --install-codex-hooks`,
    }))
  }
  const paths = [...new Set(targets.map((target) => target.path))]
  return [{ status: "pass", label: "Codex 钩子", message: `记录器文件：${paths.join("、")}` }]
}

async function canWriteHome(home: string): Promise<boolean> {
  const probe = join(home, `.doctor-${process.pid}-${Date.now()}`)
  try {
    mkdirSync(home, { recursive: true })
    writeFileSync(probe, "", { flag: "wx" })
    unlinkSync(probe)
    return true
  } catch {
    try { unlinkSync(probe) } catch { /* Ignore cleanup failures. */ }
    return false
  }
}

export async function runDoctor(dependencies: DoctorDependencies): Promise<{ checks: DoctorCheck[]; output: string }> {
  const now = dependencies.now ?? Date.now()
  const home = dependencies.home ?? recorderHome(dependencies.env)
  const checks: DoctorCheck[] = []
  const nodeVersion = dependencies.nodeVersion ?? process.versions.node
  const major = Number(/^v?(\d+)/u.exec(nodeVersion)?.[1] ?? 0)
  checks.push({ status: major >= 18 ? "pass" : "fail", label: "Node", message: `${nodeVersion}${major >= 18 ? "" : "（需要 18 以上）"}` })

  try {
    const git = dependencies.git ?? createGitRunner()
    const result = await git.run(["--version"], dependencies.cwd ?? process.cwd())
    const version = result.stdout.trim() || result.stderr.trim()
    checks.push({ status: result.ok ? "pass" : "fail", label: "git", message: result.ok ? version : "未安装或不可用" })
  } catch {
    checks.push({ status: "fail", label: "git", message: "未安装或不可用" })
  }

  const writable = await canWriteHome(home)
  checks.push({ status: writable ? "pass" : "fail", label: "本机目录", message: writable ? `${home} 可写` : `${home} 不可写` })
  const credentials = Object.hasOwn(dependencies, "credentials")
    ? dependencies.credentials ?? null
    : (dependencies.loadCredentials ?? loadCredentialsDefault)(home, dependencies.env)
  checks.push({
    status: credentials ? "pass" : "warning",
    label: "凭据",
    message: credentials ? `来源：${credentials.source}` : "尚未配置",
  })

  if (credentials) {
    const client = dependencies.client ?? (dependencies.createClient ?? ((value) => createClient({ url: value.url, token: value.token })))(credentials)
    try {
      const response = await client.getBindings()
      checks.push({ status: "pass", label: "服务器", message: `已连接，${response.bindings.length} 个绑定目录` })
      const events = (dependencies.readEvents ?? readEventsDefault)(home, { now })
      const open = (dependencies.compute ?? computeTasksDefault)(events, now).open
      const boundDirs = new Set(response.bindings.map((binding) => dirNameKey(binding.dir)))
      const windows: LiveWindow[] = open
        .filter((window) => boundDirs.has(dirNameKey(window.dir)))
        .slice(0, LIVE_MAX_WINDOWS)
        .map((window) => ({ session: window.session, dir: window.dir, agent: window.agent, since: window.since, minutes: window.minutes }))
      if (windows.length === 0) {
        checks.push({ status: "warning", label: "令牌权限", message: "没有进行中的已绑定窗口，未发送写入探测" })
      } else {
        try {
          await client.putLive({ windows } satisfies LiveRequest)
          checks.push({ status: "pass", label: "令牌权限", message: "可以直接写入记录" })
        } catch (error) {
          if (error instanceof RecorderHttpError && error.kind === "forbidden") {
            checks.push({ status: "fail", label: "令牌权限", message: "需要『直接改』权限的令牌" })
          } else {
            checks.push({ status: "fail", label: "令牌权限", message: error instanceof Error ? error.message : String(error) })
          }
        }
      }
    } catch (error) {
      checks.push({ status: "fail", label: "服务器", message: error instanceof Error ? error.message : String(error) })
    }
  } else {
    checks.push({ status: "warning", label: "服务器", message: "未检查（没有凭据）" })
  }

  const state = (dependencies.readState ?? readStateDefault)(home)
  if (state.lastHook) {
    const minutes = Math.max(0, Math.floor((now - state.lastHook.at) / 60_000))
    checks.push({ status: "pass", label: "最近钩子", message: `${minutes} 分钟前，${state.lastHook.agent} ${state.lastHook.event}` })
  } else {
    checks.push({ status: "warning", label: "最近钩子", message: "还没收到任何钩子事件，检查插件是否启用、宿主是否加载插件钩子" })
  }
  if (state.lastSync) {
    checks.push({ status: state.lastSync.ok ? "pass" : "warning", label: "最近同步", message: state.lastSync.ok ? "成功" : state.lastSync.message ?? "失败" })
  } else {
    checks.push({ status: "warning", label: "最近同步", message: "尚无同步记录" })
  }
  checks.push({ status: "pass", label: "事件日志", message: formatBytes(eventLogBytes(home)) })
  checks.push(...codexHookChecks(dependencies.env, dependencies.homeDir))

  const labels = { pass: "通过", warning: "警告", fail: "失败" } as const
  return { checks, output: checks.map((check) => `${labels[check.status]} - ${check.label}：${check.message}`).join("\n") }
}
