import { performance } from "node:perf_hooks"
import { describe, expect, it, vi } from "vitest"
import { main, type CliIO } from "./cli"

function io(stdin = "") {
  const stdout: string[] = []
  const stderr: string[] = []
  const value: CliIO = {
    stdin,
    stdout: { write: (text) => { stdout.push(text); return true } },
    stderr: { write: (text) => { stderr.push(text); return true } },
  }
  return { value, stdout, stderr }
}

describe("CLI", () => {
  it("prints help/version and returns usage exit status for an unknown command", async () => {
    const help = io()
    await expect(main(["--help"], {}, help.value)).resolves.toBe(0)
    expect(help.stdout[0]).toContain("用法：deverdesk-recorder")

    const version = io()
    await expect(main(["--version"], {}, version.value)).resolves.toBe(0)
    expect(version.stdout[0]).toBe("0.1.0\n")

    const unknown = io()
    await expect(main(["nonesuch"], {}, unknown.value)).resolves.toBe(2)
    expect(unknown.stderr[0]).toContain("用法：")
    expect(unknown.stderr[0]).toContain("未知命令：nonesuch")
  })

  it("dispatches parsed flags and hidden time to injected command handlers", async () => {
    const sync = vi.fn(async () => "sync result")
    const status = vi.fn(async () => "status result")
    const backfill = vi.fn(async () => "backfill result")
    const handlers = { sync, status, backfill }
    const syncIo = io()
    await expect(main(["sync", "--all", "--dry-run", "--days", "12", "--delay", "0", "--now", "1234"], {}, syncIo.value, handlers)).resolves.toBe(0)
    expect(sync).toHaveBeenCalledWith({ all: true, dryRun: true, days: 12, delayMs: 0 }, {}, 1234)
    expect(syncIo.stdout[0]).toBe("sync result\n")

    const statusIo = io()
    await main(["status", "--json"], {}, statusIo.value, handlers)
    expect(status).toHaveBeenCalledWith({ json: true }, {}, undefined)

    const backfillIo = io()
    await main(["backfill", "--agent", "codex", "--days", "5", "--dry-run"], {}, backfillIo.value, handlers)
    expect(backfill).toHaveBeenCalledWith({ agent: "codex", days: 5, dryRun: true }, {}, undefined)
  })

  it("sends Codex's final hook argument as a fallback and suppresses hook failures", async () => {
    const hook = vi.fn(async () => ({}))
    const hookIo = io()
    await expect(main(["hook", "codex", "Stop", "{\"session_id\":\"s\"}"], {}, hookIo.value, { hook })).resolves.toBe(0)
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ agent: "codex", eventName: "Stop", input: "{\"session_id\":\"s\"}" }))
    expect(hookIo.stdout).toHaveLength(0)
    expect(hookIo.stderr).toHaveLength(0)

    const sessionStart = io("")
    await main(["hook", "codex", "SessionStart", "{}"], {}, sessionStart.value, { hook: vi.fn(async () => ({ stdout: "briefing" })) })
    expect(sessionStart.stdout).toEqual(["briefing\n"])

    const broken = io()
    await expect(main(["hook", "codex", "Stop"], {}, broken.value, { hook: async () => { throw new Error("broken") } })).resolves.toBe(0)
    expect(broken.stderr).toHaveLength(0)
  })

  it("bounds hook stdin reads when the host keeps the pipe open", async () => {
    const stdin = {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<Uint8Array>>(() => undefined) }),
    } as AsyncIterable<Uint8Array>
    const hook = vi.fn(async () => ({}))
    const output = io()
    const started = performance.now()
    await expect(main(["hook", "codex", "Stop"], {}, { ...output.value, stdin }, { hook })).resolves.toBe(0)
    expect(performance.now() - started).toBeGreaterThanOrEqual(2900)
    expect(performance.now() - started).toBeLessThan(4500)
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ input: "" }))
  })

  it("parses done, tasks, setup and doctor commands into their handler options", async () => {
    const done = vi.fn(async () => "done")
    const tasks = vi.fn(async () => "tasks")
    const setup = vi.fn(async () => "setup")
    const doctor = vi.fn(async () => "doctor")
    const handlers = { done, tasks, setup, doctor }
    await main(["done", "Release", "--session", "s", "--agent", "codex"], {}, io().value, handlers)
    await main(["tasks", "--since", "24h", "--json"], {}, io().value, handlers)
    await main(["setup", "--url", "https://example.test", "--token", "dd_token", "--install-codex-hooks"], {}, io().value, handlers)
    await main(["doctor"], {}, io().value, handlers)
    expect(done).toHaveBeenCalledWith({ title: "Release", session: "s", agent: "codex" }, {}, undefined)
    expect(tasks).toHaveBeenCalledWith({ since: "24h", json: true }, {}, undefined)
    expect(setup).toHaveBeenCalledWith({ url: "https://example.test", token: "dd_token", installCodexHooks: true }, {})
    expect(doctor).toHaveBeenCalledWith({}, undefined)
  })

  it("rejects malformed command options with exit code 2 and execution failures with 1", async () => {
    const malformed = io()
    await expect(main(["sync", "--days", "zero"], {}, malformed.value)).resolves.toBe(2)
    expect(malformed.stderr[0]).toContain("正整数")

    const failure = io()
    await expect(main(["doctor"], {}, failure.value, { doctor: async () => { throw new Error("doctor failed") } })).resolves.toBe(1)
    expect(failure.stderr[0]).toContain("doctor failed")
  })
})
