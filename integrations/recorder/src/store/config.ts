import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface Credentials {
  /** 去掉了结尾斜杠 */
  url: string
  token: string
  source: "env" | "plugin" | "config"
}

/**
 * 读凭据，顺序：DEVERDESK_URL + DEVERDESK_TOKEN → CLAUDE_PLUGIN_OPTION_SERVER_URL + CLAUDE_PLUGIN_OPTION_TOKEN → <home>/config.json。
 * 一对里缺一个就算没有；都没有返回 null。
 */
export function loadCredentials(home: string, env: Record<string, string | undefined> = process.env): Credentials | null {
  const candidates = [
    { url: env.DEVERDESK_URL, token: env.DEVERDESK_TOKEN, source: "env" as const },
    { url: env.CLAUDE_PLUGIN_OPTION_SERVER_URL, token: env.CLAUDE_PLUGIN_OPTION_TOKEN, source: "plugin" as const },
  ]

  for (const candidate of candidates) {
    const credentials = normalizeCredentials(candidate.url, candidate.token, candidate.source)
    if (credentials) return credentials
  }

  try {
    const config: unknown = JSON.parse(readFileSync(join(home, "config.json"), "utf8"))
    if (!isRecord(config)) return null
    return normalizeCredentials(config.url, config.token, "config")
  } catch {
    return null
  }
}

/** 写 config.json（权限 0600；Windows 上忽略权限） */
export function saveConfig(home: string, config: { url: string; token: string }): void {
  mkdirSync(home, { recursive: true })
  const filePath = join(home, "config.json")
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  try {
    chmodSync(filePath, 0o600)
  } catch {
    // Windows 不提供与 Unix 相同的文件权限语义。
  }
}

function normalizeCredentials(url: unknown, token: unknown, source: Credentials["source"]): Credentials | null {
  if (typeof url !== "string" || typeof token !== "string" || token.length === 0) return null
  const normalizedUrl = url.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(normalizedUrl)) return null
  return { url: normalizedUrl, token, source }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
