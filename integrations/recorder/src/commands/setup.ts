import { randomUUID } from "node:crypto"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { createClient, RecorderHttpError, type RecorderClient } from "../upload/client"
import { saveConfig as saveConfigDefault } from "../store/config"
import { recorderHome } from "../store/paths"

interface JsonRecord {
  [key: string]: unknown
}

const CODEX_HOOK_EVENTS = new Set(["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"])

export interface SetupOptions {
  url: string
  token: string
  installCodexHooks?: boolean
}

export interface SetupDependencies {
  env: Record<string, string | undefined>
  home?: string
  cliPath: string
  now?: number
  createClient?(url: string, token: string): Pick<RecorderClient, "getBindings">
  saveConfig?(home: string, config: { url: string; token: string }): void
  codexHome?: string
  homeDir?: string
}

function isManagedRecorderCommand(command: string): boolean {
  return /\bhook\s+codex\b/iu.test(command)
    && /(?:^|[\\/\s])deverdesk-recorder(?:\.(?:[cm]?js|exe))?(?=[\s"']|$)/iu.test(command)
}

export function managedRecorderPathFromCommand(command: string): string | undefined {
  if (!isManagedRecorderCommand(command)) return undefined
  const match = /(?:"([^"]+)"|'([^']+)'|(\S+))\s+hook\s+codex\s+\S+/iu.exec(command)
  const path = match?.[1] ?? match?.[2] ?? match?.[3]
  return path ? resolve(path) : undefined
}

function resolveCodexHome(configured: string | undefined, homeDir = homedir()): string {
  return configured?.trim() ? configured : join(homeDir, ".codex")
}

function writeHooksAtomically(path: string, next: JsonRecord, now: number): string | undefined {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  let backup: string | undefined
  try {
    writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    if (existsSync(path)) {
      const stamp = new Date(now).toISOString().replace(/[:.]/gu, "-")
      backup = `${path}.bak-${stamp}`
      copyFileSync(path, backup)
    }
    renameSync(tempPath, path)
    return backup
  } finally {
    try {
      unlinkSync(tempPath)
    } catch {
      // Rename already removed the temporary file.
    }
  }
}

function sameRecorderPath(sourcePath: string, targetPath: string): boolean {
  if (resolve(sourcePath) === resolve(targetPath)) return true
  try {
    return realpathSync(sourcePath) === realpathSync(targetPath)
  } catch {
    return false
  }
}

function installRecorder(sourcePath: string, recorderDirectory: string): string {
  const targetPath = resolve(recorderDirectory, "bin", "deverdesk-recorder")
  if (sameRecorderPath(sourcePath, targetPath)) return targetPath

  const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`
  try {
    mkdirSync(dirname(targetPath), { recursive: true })
    copyFileSync(sourcePath, tempPath)
    if (process.platform !== "win32") chmodSync(tempPath, 0o755)
    renameSync(tempPath, targetPath)
  } catch (error) {
    throw new Error(`无法安装 Codex 记录器到固定位置 ${targetPath}（来源 ${resolve(sourcePath)}）：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    try {
      unlinkSync(tempPath)
    } catch {
      // Rename already removed the temporary file.
    }
  }
  return targetPath
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function recorderHookCommand(cliPath: string, event: string): JsonRecord {
  return {
    type: "command",
    command: `node "${cliPath}" hook codex ${event}`,
    ...(event === "SessionEnd" ? { timeout: 3 } : {}),
  }
}

function prepareHooksFile(source: unknown, cliPath: string): JsonRecord {
  if (!isRecord(source)) throw new Error("hooks.json 顶层必须是 JSON 对象")
  const root: JsonRecord = { ...source }
  const existingHooks = root.hooks ?? {}
  if (!isRecord(existingHooks)) throw new Error("hooks.json 的 hooks 必须是对象")
  const hooks: JsonRecord = { ...existingHooks }
  for (const [event, value] of Object.entries(hooks)) {
    if (!CODEX_HOOK_EVENTS.has(event) || !Array.isArray(value)) continue
    const groups = value.flatMap((group) => {
      if (!isRecord(group) || !Array.isArray(group.hooks)) return [group]
      const commands = group.hooks.filter((item) => !(isRecord(item) && typeof item.command === "string" && isManagedRecorderCommand(item.command)))
      if (commands.length === 0) return []
      return [{ ...group, hooks: commands }]
    })
    hooks[event] = groups
  }
  const absoluteCliPath = resolve(cliPath)
  for (const event of ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"]) {
    const groups = Array.isArray(hooks[event]) ? [...hooks[event] as unknown[]] : []
    groups.push({ hooks: [recorderHookCommand(absoluteCliPath, event)] })
    hooks[event] = groups
  }
  root.hooks = hooks
  return root
}

export function installCodexHooks(options: { codexHome: string; cliPath: string; now?: number }): { path: string; backup?: string } {
  const path = join(resolveCodexHome(options.codexHome), "hooks.json")
  const existed = existsSync(path)
  let source: unknown = { hooks: {} }
  if (existed) {
    try {
      source = JSON.parse(readFileSync(path, "utf8")) as unknown
    } catch {
      throw new Error("Codex hooks.json 格式错误，未修改文件")
    }
  }
  const next = prepareHooksFile(source, options.cliPath)
  const backup = writeHooksAtomically(path, next, options.now ?? Date.now())
  return { path, ...(backup === undefined ? {} : { backup }) }
}

function validateUrl(input: string): string {
  let parsed: URL
  try {
    parsed = new URL(input.trim())
  } catch {
    throw new Error("服务器地址必须是有效的 http 或 https 地址")
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
    throw new Error("服务器地址必须是有效的 http 或 https 地址")
  }
  return input.trim().replace(/\/+$/u, "")
}

export async function runSetup(options: SetupOptions, dependencies: SetupDependencies): Promise<string> {
  const url = validateUrl(options.url)
  const token = options.token.trim()
  if (!token) throw new Error("令牌不能为空")
  const client = (dependencies.createClient ?? ((serverUrl, accessToken) => createClient({ url: serverUrl, token: accessToken })))(url, token)
  try {
    await client.getBindings()
  } catch (error) {
    if (error instanceof RecorderHttpError && error.kind === "auth") throw new Error("令牌无效或已过期，未保存配置")
    if (error instanceof RecorderHttpError && error.kind === "forbidden") throw new Error("令牌没有读取绑定清单的权限，未保存配置")
    throw new Error(`连接服务器失败，未保存配置：${error instanceof Error ? error.message : String(error)}`)
  }

  const codexHome = resolveCodexHome(dependencies.codexHome ?? dependencies.env.CODEX_HOME, dependencies.homeDir)
  const hooksPath = join(codexHome, "hooks.json")
  let existingHooks: unknown
  let nextHooks: JsonRecord | undefined
  if (options.installCodexHooks) {
    existingHooks = { hooks: {} }
    if (existsSync(hooksPath)) {
      try {
        existingHooks = JSON.parse(readFileSync(hooksPath, "utf8")) as unknown
      } catch {
        throw new Error("Codex hooks.json 格式错误，未修改文件或保存配置")
      }
    }
  }

  const home = dependencies.home ?? recorderHome(dependencies.env)
  let recorderPath: string | undefined
  if (options.installCodexHooks) {
    recorderPath = installRecorder(dependencies.cliPath, home)
    nextHooks = prepareHooksFile(existingHooks, recorderPath)
  }
  ;(dependencies.saveConfig ?? saveConfigDefault)(home, { url, token })
  let hookMessage = ""
  if (nextHooks && recorderPath) {
    const backup = writeHooksAtomically(hooksPath, nextHooks, dependencies.now ?? Date.now())
    hookMessage = `，已安装 Codex 钩子：固定记录器路径 ${recorderPath}；hooks.json ${hooksPath}；备份 ${backup ?? "无（原文件不存在）"}`
  }
  const warning = token.startsWith("dd_") ? "" : "警告：令牌通常以 dd_ 开头。\n"
  return `${warning}配置已保存：${url}${hookMessage}`
}
