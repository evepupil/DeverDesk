import { describe, expect, it, vi } from "vitest"
import { createClient } from "../upload/client"
import { createDefaultSyncState, type SyncInput, type SyncOutcome } from "../sync/sync"
import { runSyncCommand } from "./sync"

const credentials = { url: "https://example.test", token: "dd_token", source: "config" as const }

function dependencies() {
  let input: SyncInput | undefined
  return {
    env: {} as Record<string, string | undefined>,
    home: "/tmp/recorder",
    now: 1234,
    loadCredentials: vi.fn((): typeof credentials | null => credentials),
    createClient: vi.fn(() => createClient({ url: credentials.url, token: credentials.token })),
    run: vi.fn(async (value: SyncInput): Promise<SyncOutcome> => {
      input = value
      return { uploadedTasks: 2, uploadedEntries: 3, skipped: 1, rejected: 0, liveSent: true }
    }),
    state: createDefaultSyncState(),
    getInput: () => input,
  }
}

describe("runSyncCommand", () => {
  it("passes timing and options into sync and formats its result", async () => {
    const deps = dependencies()
    await expect(runSyncCommand({ all: true, dryRun: false, days: 10, delayMs: 250, settleLockPath: "/tmp/settle.lock" }, deps)).resolves.toContain("上传 2 个任务、3 段投入")
    expect(deps.getInput()?.now).toBe(1234)
    expect(deps.getInput()?.options).toEqual({ all: true, dryRun: false, days: 10, delayMs: 250, settleLockPath: "/tmp/settle.lock" })
    expect(deps.createClient).toHaveBeenCalledWith(credentials)
  })

  it("passes the settle reservation from the child environment", async () => {
    const deps = dependencies()
    deps.env.DEVERDESK_RECORDER_SETTLE_LOCK = "/tmp/settle-from-env.lock"
    await runSyncCommand({ all: false, dryRun: false, delayMs: 5000 }, deps)
    expect(deps.getInput()?.options.settleLockPath).toBe("/tmp/settle-from-env.lock")
  })

  it("formats dry-run keys and locked outcomes without treating skipped counts as a lock", async () => {
    const dry = dependencies()
    dry.run.mockResolvedValue({ uploadedTasks: 0, uploadedEntries: 0, skipped: 0, rejected: 0, liveSent: false, taskKeys: ["task"], entryKeys: ["entry"] })
    await expect(runSyncCommand({ all: false, dryRun: true }, dry)).resolves.toContain(["任务键：task", "时间段键：entry"].join("\n"))

    const noCredentials = dependencies()
    noCredentials.loadCredentials.mockReturnValue(null)
    noCredentials.run.mockResolvedValue({ uploadedTasks: 0, uploadedEntries: 0, skipped: 0, rejected: 0, liveSent: false, error: "未配置凭据" })
    await expect(runSyncCommand({ all: false, dryRun: true }, noCredentials)).resolves.toContain("未配置凭据")

    const locked = dependencies()
    locked.run.mockResolvedValue({ skipped: "locked" })
    await expect(runSyncCommand({ all: false, dryRun: false }, locked)).resolves.toContain("跳过本次")
  })
})
