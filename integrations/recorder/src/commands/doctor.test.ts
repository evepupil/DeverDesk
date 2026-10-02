import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { emptyState } from "../store/state"
import { RecorderHttpError } from "../upload/client"
import { runDoctor } from "./doctor"

const directories: string[] = []
const now = Date.parse("2025-04-05T12:00:00.000Z")

function home(): string {
  const path = mkdtempSync(join(tmpdir(), "recorder-doctor-"))
  directories.push(path)
  return path
}

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})

const git = { run: vi.fn(async () => ({ ok: true, stdout: "git version 2.45.0", stderr: "" })) }

describe("runDoctor", () => {
  it("checks local requirements and reports missing credentials and hook", async () => {
    const result = await runDoctor({
      home: home(), homeDir: home(), env: {}, now, nodeVersion: "v20.0.0", git,
      credentials: null,
      readState: () => emptyState(),
    })
    expect(result.checks.find((check) => check.label === "Node")?.status).toBe("pass")
    expect(result.checks.find((check) => check.label === "本机目录")?.status).toBe("pass")
    expect(result.checks.find((check) => check.label === "凭据")?.status).toBe("warning")
    expect(result.output).toContain("宿主是否加载插件钩子")
  })

  it("checks the default Codex home and reports existing recorder files", async () => {
    const testHome = home()
    const recorderPath = join(testHome, "app", "bin", "deverdesk-recorder")
    const hooksPath = join(testHome, ".codex", "hooks.json")
    mkdirSync(dirname(recorderPath), { recursive: true })
    mkdirSync(dirname(hooksPath), { recursive: true })
    writeFileSync(recorderPath, "recorder")
    writeFileSync(hooksPath, JSON.stringify({ hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: `node "${recorderPath}" hook codex SessionStart` }] }],
      Stop: [{ hooks: [{ type: "command", command: `"${recorderPath}" hook codex Stop` }] }],
    } }))

    const result = await runDoctor({
      home: join(testHome, "app"), homeDir: testHome, env: { CODEX_HOME: "" }, now, nodeVersion: "v20.0.0", git,
      credentials: null, readState: () => emptyState(),
    })

    expect(result.checks.find((check) => check.label === "Codex 钩子")).toMatchObject({ status: "pass", message: `记录器文件：${recorderPath}` })
  })

  it("fails each managed Codex hook whose recorder file is missing", async () => {
    const testHome = home()
    const codexHome = join(testHome, "codex")
    const sessionStart = join(testHome, "missing", "start", "deverdesk-recorder")
    const stop = join(testHome, "missing", "stop", "deverdesk-recorder")
    mkdirSync(codexHome, { recursive: true })
    writeFileSync(join(codexHome, "hooks.json"), JSON.stringify({ hooks: {
      SessionStart: [{ hooks: [{ command: `node "${sessionStart}" hook codex SessionStart` }] }],
      Stop: [{ hooks: [{ command: `node "${stop}" hook codex Stop` }] }],
    } }))

    const result = await runDoctor({
      home: join(testHome, "app"), homeDir: testHome, env: { CODEX_HOME: codexHome }, now, nodeVersion: "v20.0.0", git,
      credentials: null, readState: () => emptyState(),
    })

    expect(result.checks.filter((check) => check.label === "Codex 钩子")).toEqual([
      { status: "fail", label: "Codex 钩子", message: `SessionStart 指向的文件不存在（${sessionStart}），重新运行 deverdesk-recorder setup --install-codex-hooks` },
      { status: "fail", label: "Codex 钩子", message: `Stop 指向的文件不存在（${stop}），重新运行 deverdesk-recorder setup --install-codex-hooks` },
    ])
  })

  it("warns for malformed hooks.json", async () => {
    const testHome = home()
    const codexHome = join(testHome, "codex")
    mkdirSync(codexHome, { recursive: true })
    writeFileSync(join(codexHome, "hooks.json"), "{broken")

    const result = await runDoctor({
      home: join(testHome, "app"), homeDir: testHome, env: { CODEX_HOME: codexHome }, now, nodeVersion: "v20.0.0", git,
      credentials: null, readState: () => emptyState(),
    })

    expect(result.checks.find((check) => check.label === "Codex 钩子")).toMatchObject({ status: "warning", message: `无法解析：${join(codexHome, "hooks.json")}` })
  })

  it("does not report Codex when hooks.json is absent or has no managed hook", async () => {
    const testHome = home()
    const absent = await runDoctor({
      home: join(testHome, "absent-app"), homeDir: testHome, env: {}, now, nodeVersion: "v20.0.0", git,
      credentials: null, readState: () => emptyState(),
    })
    expect(absent.checks.some((check) => check.label === "Codex 钩子")).toBe(false)

    const codexHome = join(testHome, "codex")
    mkdirSync(codexHome, { recursive: true })
    writeFileSync(join(codexHome, "hooks.json"), JSON.stringify({ hooks: {
      SessionStart: [{ hooks: [{ command: "node custom.js hook codex SessionStart" }] }],
    } }))
    const unrelated = await runDoctor({
      home: join(testHome, "unrelated-app"), homeDir: testHome, env: { CODEX_HOME: codexHome }, now, nodeVersion: "v20.0.0", git,
      credentials: null, readState: () => emptyState(),
    })
    expect(unrelated.checks.some((check) => check.label === "Codex 钩子")).toBe(false)
  })

  it("identifies the direct-write permission required by live sync", async () => {
    const putLive = vi.fn(async () => { throw new RecorderHttpError(403, "forbidden", "permission denied") })
    const result = await runDoctor({
      home: home(), homeDir: home(), env: {}, now, nodeVersion: "v20.0.0", git,
      credentials: { url: "https://example.test", token: "dd_token", source: "config" },
      client: {
        getBindings: async () => ({ bindings: [{ dir: "repo", projectId: "p", projectName: "Project" }] }),
        putLive,
      },
      readEvents: () => [],
      compute: () => ({ tasks: [], open: [{ session: "s", dir: "Repo", agent: "codex", since: now - 60_000, minutes: 1 }] }),
      readState: () => emptyState(),
    })
    expect(putLive).toHaveBeenCalledWith({ windows: [{ session: "s", dir: "Repo", agent: "codex", since: now - 60_000, minutes: 1 }] })
    expect(result.checks.find((check) => check.label === "服务器")?.status).toBe("pass")
    expect(result.checks.find((check) => check.label === "令牌权限")).toMatchObject({ status: "fail", message: "需要『直接改』权限的令牌" })
  })
})
