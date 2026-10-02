import { describe, expect, it, vi } from "vitest"
import type { DoneEvent, RecorderEvent } from "../core/types"
import { runDone } from "./done"

const now = Date.parse("2025-04-05T12:00:00.000Z")
const base = { v: 1 as const, t: now - 1000, agent: "claude-code" as const, session: "recent-session", dir: "Repo", cwd: "/repo", kind: "start" as const }

function dependencies(events: RecorderEvent[] = []) {
  return {
    home: "/tmp/recorder",
    cwd: "/repo",
    env: {} as Record<string, string | undefined>,
    now,
    resolveDirName: vi.fn(async () => ({ dir: "repo", repo: "/repo" })),
    readEvents: vi.fn(() => events),
    appendEvent: vi.fn(),
    spawnBackgroundSync: vi.fn(),
  }
}

describe("runDone", () => {
  it("uses the latest same-directory session and appends a trimmed done event", async () => {
    const deps = dependencies([base])
    deps.env.DEVERDESK_URL = "https://server.example"
    deps.env.DEVERDESK_TOKEN = "token"
    await expect(runDone({ title: "  Finished the migration  " }, deps)).resolves.toBe("已记下：Finished the migration")
    expect(deps.appendEvent).toHaveBeenCalledWith("/tmp/recorder", {
      v: 1,
      t: now,
      agent: "claude-code",
      session: "recent-session",
      dir: "repo",
      cwd: "/repo",
      kind: "done",
      title: "Finished the migration",
    } satisfies DoneEvent)
    expect(deps.spawnBackgroundSync).toHaveBeenCalledOnce()
  })

  it("uses a manual UTC-date session when no session exists and honors explicit options", async () => {
    const deps = dependencies()
    deps.env.CLAUDE_CODE_SESSION_ID = "claude-live"
    await runDone({ title: "Manual", session: "chosen", agent: "codex" }, deps)
    expect(deps.appendEvent).toHaveBeenCalledWith("/tmp/recorder", expect.objectContaining({ agent: "codex", session: "chosen" }))

    const manual = dependencies()
    await runDone({ title: "Manual", agent: "codex" }, manual)
    expect(manual.appendEvent).toHaveBeenCalledWith("/tmp/recorder", expect.objectContaining({ agent: "codex", session: "manual-2025-04-05" }))
  })

  it("honors explicit agent, truncates long titles, and skips sync without credentials", async () => {
    const deps = dependencies()
    deps.env.CLAUDE_CODE_SESSION_ID = "claude-live"
    await runDone({ title: "x".repeat(6000), agent: "codex" }, deps)
    expect(deps.appendEvent).toHaveBeenCalledWith("/tmp/recorder", expect.objectContaining({
      agent: "codex",
      session: "claude-live",
      title: "x".repeat(80),
    }))
    expect(deps.spawnBackgroundSync).not.toHaveBeenCalled()
  })

  it("starts background sync when credentials are available", async () => {
    const deps = dependencies()
    deps.env.DEVERDESK_URL = "https://server.example"
    deps.env.DEVERDESK_TOKEN = "token"
    await runDone({ title: "Has credentials" }, deps)
    expect(deps.spawnBackgroundSync).toHaveBeenCalledOnce()
  })

  it("rejects an empty title with exit code 2 and does not spawn sync", async () => {
    const deps = dependencies()
    await expect(runDone({ title: "  " }, deps)).rejects.toMatchObject({ exitCode: 2 })
    expect(deps.appendEvent).not.toHaveBeenCalled()
    expect(deps.spawnBackgroundSync).not.toHaveBeenCalled()
  })
})
