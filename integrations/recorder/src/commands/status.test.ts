import { describe, expect, it, vi } from "vitest"
import type { ComputedTask, RecorderEvent } from "../core/types"
import type { Credentials } from "../store/config"
import { emptyState } from "../store/state"
import { runStatus } from "./status"

const now = 1_750_000_000_000

function task(key: string, dir: string): ComputedTask {
  return { key, agent: "codex", session: "s", dir, source: "done", title: key, finishedAt: now, commits: [], entries: [] }
}

function dependencies() {
  const state = emptyState()
  state.lastHook = { at: now - 1000, agent: "codex", event: "Stop", session: "s" }
  state.lastSync = { startedAt: now - 2000, finishedAt: now - 1000, ok: true, uploadedTasks: 1 }
  return {
    cwd: "/repo",
    home: "/tmp/recorder",
    env: {},
    now,
    resolveDirName: vi.fn(async () => ({ dir: "Repo", repo: "/repo" })),
    loadCredentials: vi.fn((): Credentials | null => ({ url: "https://example.test", token: "x", source: "env" })),
    readBindings: vi.fn(() => [
      { dir: "repo", projectId: "project-1", projectName: "Project" },
      { dir: "Elsewhere", projectId: "project-2", projectName: "Other" },
    ]),
    readEvents: vi.fn(() => [] as RecorderEvent[]),
    compute: vi.fn(() => ({ tasks: [task("pending", "REPO"), task("done", "Repo"), task("unbound", "Other")] })),
    readState: vi.fn(() => state),
    readUploadedKeys: vi.fn(() => ({ done: new Set(["done"]), rejected: new Map([["rejected", "bad"]]) })),
  }
}

describe("runStatus", () => {
  it("returns stable JSON with binding, credential source and pending count", async () => {
    const deps = dependencies()
    const first = await runStatus({ json: true }, deps)
    const second = await runStatus({ json: true }, deps)
    expect(first.output).toBe(second.output)
    expect(JSON.parse(first.output)).toEqual({
      dir: "Repo",
      repo: "/repo",
      bound: true,
      project: { id: "project-1", name: "Project" },
      credentials: "env",
      lastHook: { at: now - 1000, agent: "codex", event: "Stop", session: "s" },
      lastSync: { startedAt: now - 2000, finishedAt: now - 1000, ok: true, uploadedTasks: 1 },
      pendingTasks: 1,
    })
    expect(deps.readEvents).toHaveBeenCalledWith("/tmp/recorder", { now })
  })

  it("prints an unbound human-readable status without requiring credentials", async () => {
    const deps = dependencies()
    deps.readBindings.mockReturnValue([])
    deps.loadCredentials.mockReturnValue(null)
    const result = await runStatus({}, deps)
    expect(result.output).toContain("绑定：未绑定")
    expect(result.output).toContain("凭据：没有")
    expect(result.data.pendingTasks).toBe(0)
  })
})
