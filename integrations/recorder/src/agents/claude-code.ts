import { firstSentence } from "./text"

export interface ParsedAgentHook {
  session: string
  cwd: string
  source?: string
  text?: string
  summary?: string
  reason?: string
  commitCommand?: true
}

/** Claude Code 的钩子 JSON 转成记录器需要的字段；无会话或目录时跳过。 */
export function parseClaudeCodeHook(
  eventName: string,
  payload: unknown,
  env: Record<string, string | undefined> = process.env,
): ParsedAgentHook | null {
  if (!isRecord(payload)) return null
  const session = requiredString(payload.session_id)
  const cwd = requiredString(payload.cwd) ?? requiredString(env.CLAUDE_PROJECT_DIR)
  if (!session || !cwd) return null

  const parsed: ParsedAgentHook = { session, cwd }
  if (eventName === "SessionStart") {
    const source = optionalString(payload.source)
    if (source) parsed.source = source
  } else if (eventName === "UserPromptSubmit") {
    parsed.text = firstSentence(payload.prompt, 120)
  } else if (eventName === "Stop") {
    parsed.summary = firstSentence(payload.last_assistant_message, 200)
  } else if (eventName === "SessionEnd") {
    const reason = optionalString(payload.reason)
    if (reason) parsed.reason = reason
  } else if (eventName === "PostToolUse") {
    const toolInput = isRecord(payload.tool_input) ? payload.tool_input : undefined
    const command = typeof toolInput?.command === "string" ? toolInput.command : ""
    if (payload.tool_name !== "Bash" || !/\bgit\b/i.test(command) || !/\bcommit\b/i.test(command)) return null
    parsed.commitCommand = true
  }
  return parsed
}

function requiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
