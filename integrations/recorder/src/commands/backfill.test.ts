import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { Agent, RecorderEvent } from "../core/types"
import type { BackfillOptions, BackfillStats } from "../agents/claude-code-backfill"
import { runBackfill } from "./backfill"

const now = Date.parse("2025-04-05T12:00:00.000Z")
const event: RecorderEvent = { v: 1, t: now - 1000, agent: "codex", session: "s", dir: "Repo", cwd: "/repo", kind: "done", title: "Backfilled" }

function generator(agent: Agent, received: (options: BackfillOptions, stats: BackfillStats) => void) {
  return async function* (options: BackfillOptions, stats: BackfillStats): AsyncGenerator<RecorderEvent> {
    received(options, stats)
    stats.files = 2
    stats.sessions = 1
    stats.events = 1
    yield { ...event, agent }
  }
}

describe("runBackfill", () => {
  it("deduplicates existing event identities and respects the first live-event boundary", async () => {
    let seenOptions: BackfillOptions | undefined
    const appendEvent = vi.fn()
    const output = await runBackfill({ agent: "codex", days: 30, dryRun: false }, {
      env: { CODEX_HOME: "/sessions" }, home: "/tmp/recorder", now,
      readEvents: () => [{ ...event, agent: "claude-code" }],
      readFirstLive: () => ({ codex: now - 5000 }),
      appendEvent,
      git: { run: async () => ({ ok: true, stdout: "", stderr: "" }) },
      backfillCodex: generator("codex", (options) => { seenOptions = options }),
    })
    expect(seenOptions).toMatchObject({ root: /sessions[\\/]sessions$/u, since: now - 30 * 24 * 60 * 60_000, until: now - 5000 })
    expect(appendEvent).not.toHaveBeenCalled()
    expect(output).toContain("事件 0")
    expect(output).toContain("运行 deverdesk-recorder sync")
  })

  it("keeps dry-run read-only and runs both selected agents", async () => {
    const appendEvent = vi.fn()
    const claude = generator("claude-code", () => undefined)
    const codex = generator("codex", () => undefined)
    const output = await runBackfill({ agent: "all", days: 7, dryRun: true }, {
      env: {}, home: "/tmp/recorder", now,
      readEvents: () => [],
      readFirstLive: () => ({}),
      appendEvent,
      git: { run: async () => ({ ok: true, stdout: "", stderr: "" }) },
      backfillClaudeCode: claude,
      backfillCodex: codex,
    })
    expect(appendEvent).not.toHaveBeenCalled()
    expect(output).toContain("回填预览")
    expect(output).toContain("claude-code：文件 2，会话")
    expect(output).toContain("codex：文件 2")
  })

  it("removes prompt text from backfill when disabled by environment or config", async () => {
    const home = mkdtempSync(join(tmpdir(), "dd-backfill-privacy-"))
    try {
      const prompt: RecorderEvent = { v: 1, t: now - 1000, agent: "codex", session: "s", dir: "Repo", cwd: "/repo", kind: "prompt", text: "private historical prompt" }
      const generate = async function* (): AsyncGenerator<RecorderEvent> { yield prompt }
      const appendEvent = vi.fn()
      const git = { run: async () => ({ ok: true, stdout: "", stderr: "" }) }
      for (const env of [
        { DEVERDESK_NO_PROMPT_TEXT: "1" },
        {},
      ]) {
        if (!env.DEVERDESK_NO_PROMPT_TEXT) writeFileSync(join(home, "config.json"), JSON.stringify({ privacy: { promptText: false } }))
        await runBackfill({ agent: "codex", days: 30, dryRun: false }, {
          env, home, now, readEvents: () => [], readFirstLive: () => ({}), appendEvent, git,
          backfillCodex: generate,
        })
      }
      expect(appendEvent).toHaveBeenCalledTimes(2)
      expect(appendEvent.mock.calls.map(([, saved]) => saved)).toEqual([
        expect.objectContaining({ kind: "prompt", session: "s" }),
        expect.objectContaining({ kind: "prompt", session: "s" }),
      ])
      for (const [, saved] of appendEvent.mock.calls) expect(saved).not.toHaveProperty("text")
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
