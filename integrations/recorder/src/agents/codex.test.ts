import { describe, expect, it } from "vitest"
import { parseCodexHook } from "./codex"

describe("Codex PostToolUse commit detection", () => {
  const payload = (command: string) => ({
    session_id: "session-codex",
    cwd: "/workspace/project",
    tool_name: "Bash",
    tool_input: { command },
  })

  it.each([
    "git commit -m x",
    "git -C dir commit",
    "git add . && git commit",
    "git add .; git commit --amend",
  ])("recognizes %s", (command) => {
    expect(parseCodexHook("PostToolUse", payload(command))).toMatchObject({ commitCommand: true })
  })

  it.each([
    "git commitment",
    "echo git commit",
    "git add . && echo committed",
    "git -C dir status",
  ])("ignores non-commit command %s", (command) => {
    expect(parseCodexHook("PostToolUse", payload(command))).toBeNull()
  })
})
