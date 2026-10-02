import { readFileSync } from "node:fs"
import { join } from "node:path"

/** Prompt 内容由实时钩子和历史回填共用同一隐私策略。 */
export function isPromptTextAllowed(home: string, env: Record<string, string | undefined>): boolean {
  if (env.DEVERDESK_NO_PROMPT_TEXT === "1") return false
  try {
    const config: unknown = JSON.parse(readFileSync(join(home, "config.json"), "utf8"))
    if (isRecord(config) && isRecord(config.privacy) && config.privacy.promptText === false) return false
  } catch {
    // No config file means the default remains enabled.
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
