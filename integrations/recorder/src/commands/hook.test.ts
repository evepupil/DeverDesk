import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SETTLE_DELAY } from "../core/constants"
import type { GitRunner } from "../core/types"
import type { BriefingResponse } from "../../../../src/sync/recorder-protocol"
import { runHook } from "./hook"
import { saveConfig } from "../store/config"
import { readEvents } from "../store/event-log"
import { readState, updateState } from "../store/state"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-hook-"))
  temporaryDirectories.push(directory)
  return directory
}

function claudePayload(session: string, cwd: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { session_id: session, cwd, ...fields }
}

function fakeGit(initialHead = "old-head"): { runner: GitRunner; setHead: (value: string) => void; setLog: (value: string) => void } {
  let head = initialHead
  let log = ""
  const runner: GitRunner = { run: async (args) => {
    if (args.includes("--show-toplevel")) return { ok: true, stdout: "/repo\n", stderr: "" }
    if (args.includes("rev-parse") && args.at(-1) === "HEAD") return { ok: true, stdout: `${head}\n`, stderr: "" }
    if (args.includes("--format=%ct")) return { ok: true, stdout: "1740000000\n", stderr: "" }
    if (args.includes("user.email")) return { ok: true, stdout: "recorder@example.test\n", stderr: "" }
    if (args.some((arg) => arg.endsWith("..HEAD")) || args.some((arg) => arg.startsWith("--since="))) {
      const format = args.find((arg) => arg.startsWith("--format=")) ?? ""
      const recordSeparator = format.match(/\x1e[a-f0-9]{16}R\x1e/)?.[0] ?? "\x1e"
      const fieldSeparator = format.match(/\x1f[a-f0-9]{16}F\x1f/)?.[0] ?? "\x1f"
      return { ok: true, stdout: log.replaceAll("\x1e", recordSeparator).replaceAll("\x1f", fieldSeparator), stderr: "" }
    }
    return { ok: false, stdout: "", stderr: "unexpected git command" }
  } }
  return { runner, setHead: (value) => { head = value }, setLog: (value) => { log = value } }
}

function gitCommitRecord(sha: string, committedAt: number): string {
  const seconds = Math.floor(committedAt / 1000)
  return `\x1e${sha}\x1f${seconds}\x1f${seconds}\x1frecorder@example.test\x1fHook commit\x1fHook commit\nDetails\n\x1f1\t0\tfile.ts\n`
}

const briefing: BriefingResponse = {
  bound: true,
  today: "2025-03-05",
  project: { id: "project-1", name: "Recorder", stage: "building" },
  plannedToday: [{ code: "T-141", title: "Hook wiring", status: "doing", priority: 3, estimateMin: 25, plannedFor: "2025-03-05", dueOn: null }],
  overdue: [],
  open: [],
}

describe("runHook", () => {
  it("skips internal invocations before parsing and records malformed payloads silently", async () => {
    const home = makeTempDir()
    const log = vi.fn()
    const internal = await runHook({
      agent: "claude-code", eventName: "Stop", input: "not json", env: { DEVERDESK_RECORDER_INTERNAL: "1" },
      deps: { home, log },
    })
    expect(internal).toEqual({})
    expect(log).not.toHaveBeenCalled()

    const malformed = await runHook({
      agent: "claude-code", eventName: "Stop", input: '{"prompt":"private phrase"', env: {}, deps: { home, log },
    })
    expect(malformed).toEqual({})
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]?.[1]).not.toContain("private phrase")
  })

  it("uses Claude project cwd for resolution and stores lifecycle events and first-live state", async () => {
    const home = makeTempDir()
    const now = Date.parse("2025-03-05T12:00:00Z")
    const fake = fakeGit()
    const resolver = vi.fn(async () => ({ dir: "Project", repo: "/repo" }))
    const result = await runHook({
      agent: "claude-code", eventName: "SessionStart",
      input: claudePayload("session-1", "C:/worktree/sub", { source: "startup" }),
      env: { CLAUDE_PROJECT_DIR: "C:/worktree" }, now,
      deps: { home, git: fake.runner, resolveDir: resolver, spawnSync: vi.fn() },
    })
    expect(result).toEqual({})
    expect(resolver).toHaveBeenCalledWith("C:/worktree")
    expect(readEvents(home, {}).map((event) => event.kind)).toEqual(["start"])
    expect(readEvents(home, {})[0]).toMatchObject({ cwd: "C:/worktree/sub", dir: "Project", repo: "/repo", source: "startup" })
    expect(readState(home)).toMatchObject({
      firstLiveEvent: { "claude-code": now },
      lastHook: { at: now, agent: "claude-code", event: "SessionStart", session: "session-1" },
      sessionStarts: { '["claude-code","session-1"]': { agent: "claude-code", session: "session-1", at: now } },
      repos: { "/repo": { head: "old-head" } },
      dirCache: { "C:/worktree": { dir: "Project", repo: "/repo", at: now } },
    })
  })

  it("records Codex prompts and completes the local hook path within its budget", async () => {
    const home = makeTempDir()
    const now = Date.parse("2025-03-05T12:00:00Z")
    const startedAt = performance.now()
    await runHook({
      agent: "codex", eventName: "UserPromptSubmit",
      input: { thread_id: "codex-session", cwd: "/repo", prompt: "Review this change. More context." },
      env: {}, now,
      deps: { home, resolveDir: async () => ({ dir: "Project" }), spawnSync: vi.fn() },
    })
    expect(performance.now() - startedAt).toBeLessThan(300)
    expect(readEvents(home, {})).toMatchObject([{
      kind: "prompt", agent: "codex", session: "codex-session", dir: "Project", text: "Review this change.", t: now,
    }])
  })

  it("respects prompt privacy and the 60-second sync throttle", async () => {
    const home = makeTempDir()
    const now = 1_740_000_000_000
    await updateState(home, (state) => { state.lastSync = { startedAt: now - 60_000, finishedAt: now - 59_000, ok: true } })
    const spawnSync = vi.fn()
    await runHook({
      agent: "claude-code", eventName: "UserPromptSubmit",
      input: claudePayload("private", "/repo", { prompt: "private request. Extra detail." }),
      env: { DEVERDESK_NO_PROMPT_TEXT: "1" }, now,
      deps: { home, resolveDir: async () => ({ dir: "Project" }), spawnSync },
    })
    expect(readEvents(home, {}).at(-1)).toMatchObject({ kind: "prompt", session: "private" })
    expect(readEvents(home, {}).at(-1)).not.toHaveProperty("text")
    expect(spawnSync).not.toHaveBeenCalled()

    await updateState(home, (state) => { state.lastSync!.startedAt = now - 60_001 })
    await runHook({
      agent: "claude-code", eventName: "UserPromptSubmit",
      input: claudePayload("visible", "/repo", { prompt: "First sentence. Not stored." }),
      env: {}, now: now + 1,
      deps: { home, resolveDir: async () => ({ dir: "Project" }), spawnSync },
    })
    expect(readEvents(home, {}).at(-1)).toMatchObject({ kind: "prompt", session: "visible", text: "First sentence." })
    expect(spawnSync).toHaveBeenCalledTimes(1)
    expect(spawnSync).toHaveBeenCalledWith()
  })

  it("appends newly found commits under the state lock and schedules immediate and settled sync", async () => {
    const home = makeTempDir()
    const fake = fakeGit()
    const spawnSync = vi.fn()
    const now = Date.parse("2025-03-05T12:00:00Z")
    const deps = { home, git: fake.runner, resolveDir: async () => ({ dir: "Project", repo: "/repo" }), spawnSync }
    await runHook({
      agent: "claude-code", eventName: "SessionStart", input: claudePayload("session", "/repo"),
      env: {}, now: now - 120_000, deps,
    })
    fake.setHead("new-head")
    fake.setLog(gitCommitRecord("new-sha", now - 30_000))
    await runHook({
      agent: "claude-code", eventName: "Stop",
      input: claudePayload("session", "/repo", { last_assistant_message: "Finished. More." }),
      env: {}, now, deps,
    })
    const events = readEvents(home, {})
    expect(events.map((event) => event.kind)).toEqual(["start", "commit", "stop"])
    expect(events.find((event) => event.kind === "commit")).toMatchObject({
      sha: "new-sha", repo: "/repo", session: "session", t: now - 30_000, seenAt: now,
    })
    expect(readState(home).repos["/repo"]?.head).toBe("new-head")
    expect(spawnSync.mock.calls).toEqual([[], [{ delayMs: SETTLE_DELAY - 30_000 }]])
  })

  it("skips the long-sleeping delayed sync when DEVERDESK_NO_DELAYED_SYNC=1 but still syncs immediately", async () => {
    const home = makeTempDir()
    const fake = fakeGit()
    const spawnSync = vi.fn()
    const now = Date.parse("2025-03-05T12:00:00Z")
    const env = { DEVERDESK_NO_DELAYED_SYNC: "1" }
    const deps = { home, git: fake.runner, resolveDir: async () => ({ dir: "Project", repo: "/repo" }), spawnSync }
    await runHook({ agent: "claude-code", eventName: "SessionStart", input: claudePayload("session", "/repo"), env, now: now - 120_000, deps })
    fake.setHead("new-head")
    fake.setLog(gitCommitRecord("new-sha", now - 30_000))
    await runHook({ agent: "claude-code", eventName: "Stop", input: claudePayload("session", "/repo"), env, now, deps })
    expect(spawnSync.mock.calls).toEqual([[]])
    await runHook({ agent: "claude-code", eventName: "SessionEnd", input: claudePayload("session", "/repo", { reason: "other" }), env, now: now + 1000, deps })
    expect(spawnSync.mock.calls).toEqual([[], []])
  })

  it("runs PostToolUse discovery only for Bash git commits and schedules SessionEnd syncs", async () => {
    const home = makeTempDir()
    const fake = fakeGit()
    const spawnSync = vi.fn()
    const now = Date.parse("2025-03-05T12:00:00Z")
    const deps = { home, git: fake.runner, resolveDir: async () => ({ dir: "Project", repo: "/repo" }), spawnSync }
    await runHook({ agent: "claude-code", eventName: "SessionStart", input: claudePayload("s", "/repo"), env: {}, now, deps })
    fake.setHead("commit-head")
    fake.setLog(gitCommitRecord("commit-sha", now - SETTLE_DELAY - 1000))
    await runHook({
      agent: "claude-code", eventName: "PostToolUse", env: {}, now: now + 2000, deps,
      input: claudePayload("s", "/repo", { tool_name: "Bash", tool_input: { command: "git -C . commit -m done" } }),
    })
    expect(readEvents(home, {}).filter((event) => event.kind === "commit")).toHaveLength(1)
    expect(spawnSync.mock.calls).toEqual([[{ delayMs: 0 }]])

    await runHook({
      agent: "claude-code", eventName: "SessionEnd", env: {}, now: now + 3000, deps,
      input: claudePayload("s", "/repo", { reason: "other" }),
    })
    expect(spawnSync.mock.calls.slice(-2)).toEqual([[], [{ delayMs: SETTLE_DELAY }]])
  })

  it("uses the first observed hook as session start when installed mid-session", async () => {
    const home = makeTempDir()
    const fake = fakeGit()
    const now = 1_740_000_000_000
    const deps = { home, git: fake.runner, resolveDir: async () => ({ dir: "Project", repo: "/repo" }), spawnSync: vi.fn() }
    await runHook({
      agent: "claude-code", eventName: "UserPromptSubmit", input: claudePayload("mid-session", "/repo", { prompt: "First observed prompt." }),
      env: {}, now, deps,
    })
    fake.setHead("new-head")
    fake.setLog(gitCommitRecord("new-sha", now + 30_000))
    await runHook({
      agent: "claude-code", eventName: "Stop", input: claudePayload("mid-session", "/repo"),
      env: {}, now: now + 60_000, deps,
    })
    expect(readEvents(home, {}).map((event) => event.kind)).toEqual(["prompt", "commit", "stop"])
    expect(readEvents(home, {}).find((event) => event.kind === "commit")).toMatchObject({ sha: "new-sha", session: "mid-session" })
    expect(readState(home).sessionStarts['["claude-code","mid-session"]']).toEqual({ agent: "claude-code", session: "mid-session", at: now })
  })

  it("emits SessionStart additionalContext only for a bound directory", async () => {
    const home = makeTempDir()
    saveConfig(home, { url: "https://server.example", token: "token" })
    writeFileSync(join(home, "bindings.json"), JSON.stringify({ bindings: [{ dir: "project", projectId: "project-1", projectName: "Recorder" }] }))
    const fetchBriefing = vi.fn(async () => briefing)
    const now = Date.parse("2025-03-05T12:00:00Z")
    const result = await runHook({
      agent: "claude-code", eventName: "SessionStart", input: claudePayload("briefed", "/repo"), env: {}, now,
      deps: { home, git: fakeGit().runner, resolveDir: async () => ({ dir: "Project", repo: "/repo" }), fetchBriefing },
    })
    expect(fetchBriefing).toHaveBeenCalledWith(
      { url: "https://server.example", token: "token", source: "config" },
      "Project",
      expect.objectContaining({ timeoutMs: 800, now }),
    )
    const output = JSON.parse(result.stdout ?? "{}") as { hookSpecificOutput?: { additionalContext?: string } }
    expect(output.hookSpecificOutput?.additionalContext).toContain("DeverDesk · 副业「Recorder」")
    expect(output.hookSpecificOutput?.additionalContext).toContain("T-141 Hook wiring")
  })
})
