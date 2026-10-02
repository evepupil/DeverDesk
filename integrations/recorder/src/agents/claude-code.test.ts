import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parseClaudeCodeHook } from "./claude-code"
import { parseCodexHook } from "./codex"
import { firstSentence } from "./text"

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}.json`, import.meta.url)), "utf8")) as unknown
}

describe("agent hook payload adapters", () => {
  it("parses the five sanitized Claude Code probe payloads", () => {
    expect(parseClaudeCodeHook("SessionStart", fixture("claude-session-start"))).toMatchObject({
      session: "fixture-session", cwd: "C:/code/demo", source: "startup",
    })
    expect(parseClaudeCodeHook("UserPromptSubmit", fixture("claude-user-prompt-submit"))).toMatchObject({
      session: "fixture-session", text: "请检查示例项目并说明结果。",
    })
    expect(parseClaudeCodeHook("PostToolUse", fixture("claude-post-tool-use"))).toMatchObject({
      session: "fixture-session", commitCommand: true,
    })
    expect(parseClaudeCodeHook("Stop", fixture("claude-stop"))).toMatchObject({
      session: "fixture-session", summary: "已完成示例操作。",
    })
    expect(parseClaudeCodeHook("SessionEnd", fixture("claude-session-end"))).toMatchObject({
      session: "fixture-session", reason: "other",
    })
  })

  it("parses documented Codex hook fields and tolerates the thread id alias", () => {
    expect(parseCodexHook("SessionStart", fixture("codex-session-start"))).toMatchObject({
      session: "thr_123", cwd: "/workspace", source: "startup",
    })
    expect(parseCodexHook("UserPromptSubmit", {
      session_id: "codex-session", cwd: "/workspace", prompt: "Review this fixture. More text.",
    })?.text).toBe("Review this fixture.")
    expect(parseCodexHook("Stop", {
      thread_id: "thread-alias", cwd: "/workspace", last_assistant_message: "Done. Extra.",
    })).toMatchObject({ session: "thread-alias", summary: "Done." })
    expect(parseCodexHook("SessionEnd", {
      session_id: "codex-session", cwd: "/workspace", reason: "other",
    })?.reason).toBe("other")
  })

  it("skips payloads without required fields and ignores non-commit tool calls", () => {
    expect(parseClaudeCodeHook("Stop", { session_id: "s" }, { CLAUDE_PROJECT_DIR: "/workspace" })).toMatchObject({
      session: "s", cwd: "/workspace",
    })
    expect(parseCodexHook("Stop", { session_id: "s" })).toBeNull()
    expect(parseClaudeCodeHook("PostToolUse", {
      session_id: "s", cwd: "/workspace", tool_name: "Bash", tool_input: { command: "git status" },
    })).toBeNull()
    expect(parseClaudeCodeHook("PostToolUse", {
      session_id: "s", cwd: "/workspace", tool_name: "Write", tool_input: { command: "git commit" },
    })).toBeNull()
  })

  it("takes the first nonempty sentence, skipping slash command echoes and capping characters", () => {
    expect(firstSentence("  /compact\n  First line! Then more.", 120)).toBe("First line!")
    expect(firstSentence("   /help\n /clear ", 120)).toBeUndefined()
    expect(firstSentence("  你好。后一句", 1)).toBe("你")
    expect(firstSentence("A sentence without punctuation", 6)).toBe("A sent")
    expect(firstSentence("  ", 40)).toBeUndefined()
  })
})
