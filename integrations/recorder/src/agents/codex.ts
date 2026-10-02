import { firstSentence } from "./text"
import type { ParsedAgentHook } from "./claude-code"

/** Codex 字段暂按官方 hooks 文档宽容读取，缺少会话或工作目录时跳过。 */
export function parseCodexHook(eventName: string, payload: unknown): ParsedAgentHook | null {
  if (!isRecord(payload)) return null
  const session = requiredString(payload.session_id) ?? requiredString(payload.thread_id)
  const cwd = requiredString(payload.cwd)
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
    if (payload.tool_name !== "Bash" || !isGitCommitCommand(command)) return null
    parsed.commitCommand = true
  }
  return parsed
}

function isGitCommitCommand(command: string): boolean {
  const segments = command.replaceAll("&&", ";").replaceAll("||", ";").replaceAll("|", ";")
    .replaceAll(String.fromCharCode(10), ";").split(";")
  return segments.some((part) => {
    const tokens = (part.match(/"[^"]*"|'[^']*'|[^ ]+/g) ?? []).map((token) => {
      const quoted = (token.startsWith("\"") && token.endsWith("\"")) || (token.startsWith("'") && token.endsWith("'"))
      return quoted ? token.slice(1, -1) : token
    })
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index] ?? "")) index += 1
    let executable = tokens[index]?.toLowerCase() ?? ""
    if (executable.endsWith(".exe")) executable = executable.slice(0, -4)
    const basenameStart = Math.max(executable.lastIndexOf("/"), executable.lastIndexOf(String.fromCharCode(92))) + 1
    if (executable.slice(basenameStart) !== "git") return false
    index += 1
    while (index < tokens.length) {
      const option = tokens[index]
      if (option === "-C" || option === "-c" || option === "--git-dir" || option === "--work-tree" || option === "--namespace") {
        index += 2
        continue
      }
      if (option?.startsWith("--git-dir=") || option?.startsWith("--work-tree=") || option?.startsWith("--namespace=") || option === "--no-pager") {
        index += 1
        continue
      }
      break
    }
    return tokens[index] === "commit"
  })
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
