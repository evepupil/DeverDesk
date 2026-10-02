import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RecorderHttpError } from "../upload/client"
import { runSetup } from "./setup"

const directories: string[] = []
const now = Date.parse("2025-04-05T12:00:00.000Z")

function tempDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "recorder-setup-"))
  directories.push(path)
  return path
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("runSetup", () => {
  it("tests credentials, merges hooks, backs up existing settings and warns on token shape", async () => {
    const home = tempDirectory()
    const recorderHome = join(home, "app")
    const cliPath = join(home, "deverdesk-recorder.js")
    writeFileSync(cliPath, "recorder-v1")
    const codexHome = join(home, "codex")
    const hooksPath = join(codexHome, "hooks.json")
    mkdirSync(codexHome, { recursive: true })
    writeFileSync(hooksPath, JSON.stringify({ other: 1, hooks: {
      SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "custom" }, { type: "command", command: `node "${join(home, "deverdesk-recorder.js")}" hook codex SessionStart` }] }],
    } }))
    const client = { getBindings: vi.fn(async () => ({ bindings: [] })) }
    const saveConfig = vi.fn()
    const output = await runSetup({ url: "https://example.test/", token: "token-value", installCodexHooks: true }, {
      env: {},
      home: recorderHome,
      codexHome,
      cliPath,
      now,
      createClient: () => client,
      saveConfig,
    })
    const fixedPath = join(recorderHome, "bin", "deverdesk-recorder")
    expect(client.getBindings).toHaveBeenCalledOnce()
    expect(saveConfig).toHaveBeenCalledWith(recorderHome, { url: "https://example.test", token: "token-value" })
    expect(output).toContain("警告")
    expect(output).toContain(`固定记录器路径 ${fixedPath}`)
    expect(output).toContain(`hooks.json ${hooksPath}`)
    expect(output).toContain(`备份 ${hooksPath}.bak-${new Date(now).toISOString().replace(/[:.]/gu, "-")}`)
    expect(readFileSync(fixedPath, "utf8")).toBe("recorder-v1")
    if (process.platform !== "win32") expect(statSync(fixedPath).mode & 0o777).toBe(0o755)
    const written = JSON.parse(readFileSync(hooksPath, "utf8")) as { other: number; hooks: Record<string, { hooks: { command?: string }[]; matcher?: string }[]> }
    expect(written.other).toBe(1)
    const sessionStart = written.hooks.SessionStart ?? []
    expect(sessionStart).toHaveLength(2)
    expect(sessionStart[0]).toMatchObject({ matcher: "*", hooks: [{ command: "custom" }] })
    expect(sessionStart[1]?.hooks[0]?.command).toBe(`node "${fixedPath}" hook codex SessionStart`)
    expect(readFileSync(`${hooksPath}.bak-${new Date(now).toISOString().replace(/[:.]/gu, "-")}`, "utf8")).toContain("hook codex SessionStart")
    for (const event of ["UserPromptSubmit", "Stop", "SessionEnd"]) expect(written.hooks[event]?.length).toBe(1)
  })

  it("preserves unrelated commands that only mention the recorder name", async () => {
    const home = tempDirectory()
    const codexHome = join(home, "codex")
    const cliPath = join(home, "deverdesk-recorder.js")
    writeFileSync(cliPath, "recorder")
    mkdirSync(codexHome, { recursive: true })
    const hooksPath = join(codexHome, "hooks.json")
    const unrelated = "node C:\\my\\deverdesk-recorder-notes\\unrelated.js"
    writeFileSync(hooksPath, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: unrelated }] }] } }))
    await runSetup({ url: "https://example.test", token: "dd_valid", installCodexHooks: true }, {
      env: {}, home: join(home, "app"), codexHome, cliPath,
      createClient: () => ({ getBindings: async () => ({ bindings: [] }) }), saveConfig: vi.fn(),
    })
    const written = JSON.parse(readFileSync(hooksPath, "utf8")) as { hooks: Record<string, { hooks: { command?: string }[] }[]> }
    expect(written.hooks.SessionStart?.[0]?.hooks.some((hook) => hook.command === unrelated)).toBe(true)
    expect(written.hooks.SessionStart?.flatMap((group) => group.hooks).filter((hook) => hook.command?.includes("hook codex")).length).toBe(1)
  })

  it("uses the default Codex home for an empty override and keeps a copied backup", async () => {
    const home = tempDirectory()
    const fallbackCodexHome = join(home, ".codex")
    mkdirSync(fallbackCodexHome, { recursive: true })
    const hooksPath = join(fallbackCodexHome, "hooks.json")
    const cliPath = join(home, "deverdesk-recorder.js")
    writeFileSync(cliPath, "recorder")
    const original = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "custom" }] }] } })
    writeFileSync(hooksPath, original)
    await runSetup({ url: "https://example.test", token: "dd_valid", installCodexHooks: true }, {
      env: { CODEX_HOME: "" }, home: join(home, "app"), homeDir: home,
      cliPath, createClient: () => ({ getBindings: async () => ({ bindings: [] }) }),
      saveConfig: vi.fn(), now,
    })
    const backup = `${hooksPath}.bak-${new Date(now).toISOString().replace(/[:.]/gu, "-")}`
    expect(readFileSync(backup, "utf8")).toBe(original)
    expect(JSON.parse(readFileSync(hooksPath, "utf8")).hooks.Stop).toHaveLength(2)
    expect(readdirSync(fallbackCodexHome).some((name) => name.endsWith(".tmp"))).toBe(false)
  })

  it("updates an existing fixed recorder through an atomic replacement", async () => {
    const home = tempDirectory()
    const recorderHome = join(home, "app")
    const binDirectory = join(recorderHome, "bin")
    const fixedPath = join(binDirectory, "deverdesk-recorder")
    const cliPath = join(home, "deverdesk-recorder.js")
    mkdirSync(binDirectory, { recursive: true })
    writeFileSync(fixedPath, "old-recorder")
    writeFileSync(cliPath, "new-recorder")

    await runSetup({ url: "https://example.test", token: "dd_valid", installCodexHooks: true }, {
      env: {}, home: recorderHome, codexHome: join(home, "codex"), cliPath,
      createClient: () => ({ getBindings: async () => ({ bindings: [] }) }), saveConfig: vi.fn(),
    })

    expect(readFileSync(fixedPath, "utf8")).toBe("new-recorder")
    expect(readdirSync(binDirectory)).toEqual(["deverdesk-recorder"])
  })

  it("does not copy the recorder when it is already at the fixed path", async () => {
    const home = tempDirectory()
    const recorderHome = join(home, "app")
    const fixedPath = join(recorderHome, "bin", "deverdesk-recorder")
    mkdirSync(dirname(fixedPath), { recursive: true })
    writeFileSync(fixedPath, "already-fixed")
    const oldTime = new Date("2000-01-01T00:00:00.000Z")
    utimesSync(fixedPath, oldTime, oldTime)
    if (process.platform !== "win32") chmodSync(fixedPath, 0o600)
    const before = statSync(fixedPath)

    await runSetup({ url: "https://example.test", token: "dd_valid", installCodexHooks: true }, {
      env: {}, home: recorderHome, codexHome: join(home, "codex"), cliPath: fixedPath,
      createClient: () => ({ getBindings: async () => ({ bindings: [] }) }), saveConfig: vi.fn(),
    })

    const after = statSync(fixedPath)
    expect(readFileSync(fixedPath, "utf8")).toBe("already-fixed")
    expect(after.mtimeMs).toBe(before.mtimeMs)
    if (process.platform !== "win32") expect(after.mode & 0o777).toBe(0o600)
  })

  it("does not write hooks.json or config when copying the recorder fails", async () => {
    const home = tempDirectory()
    const recorderHome = join(home, "app")
    const codexHome = join(home, "codex")
    const hooksPath = join(codexHome, "hooks.json")
    const fixedPath = join(recorderHome, "bin", "deverdesk-recorder")
    const saveConfig = vi.fn()

    await expect(runSetup({ url: "https://example.test", token: "dd_valid", installCodexHooks: true }, {
      env: {}, home: recorderHome, codexHome, cliPath: join(home, "missing-recorder"),
      createClient: () => ({ getBindings: async () => ({ bindings: [] }) }), saveConfig,
    })).rejects.toThrow(`无法安装 Codex 记录器到固定位置 ${fixedPath}`)

    expect(existsSync(hooksPath)).toBe(false)
    expect(existsSync(fixedPath)).toBe(false)
    expect(saveConfig).not.toHaveBeenCalled()
  })

  it("does not copy the recorder when Codex hooks are not requested", async () => {
    const home = tempDirectory()
    const recorderHome = join(home, "app")
    const codexHome = join(home, "codex")
    const saveConfig = vi.fn()

    await runSetup({ url: "https://example.test", token: "dd_valid" }, {
      env: {}, home: recorderHome, codexHome, cliPath: join(home, "missing-recorder"),
      createClient: () => ({ getBindings: async () => ({ bindings: [] }) }), saveConfig,
    })

    expect(saveConfig).toHaveBeenCalledOnce()
    expect(readdirSync(home)).toEqual([])
    expect(existsSync(join(recorderHome, "bin", "deverdesk-recorder"))).toBe(false)
    expect(existsSync(join(codexHome, "hooks.json"))).toBe(false)
  })

  it("does not save credentials or alter malformed hooks.json", async () => {
    const home = tempDirectory()
    const codexHome = join(home, "codex")
    const hooksPath = join(codexHome, "hooks.json")
    mkdirSync(codexHome, { recursive: true })
    writeFileSync(hooksPath, "{broken")
    const saveConfig = vi.fn()
    await expect(runSetup({ url: "https://example.test", token: "dd_valid", installCodexHooks: true }, {
      env: {}, home: join(home, "app"), codexHome, cliPath: "/tmp/cli.js",
      createClient: () => ({ getBindings: async () => ({ bindings: [] }) }), saveConfig,
    })).rejects.toThrow("格式错误")
    expect(readFileSync(hooksPath, "utf8")).toBe("{broken")
    expect(saveConfig).not.toHaveBeenCalled()
  })

  it("rejects server authorization errors without saving", async () => {
    for (const [status, kind, message] of [
      [401, "auth", "令牌无效或已过期，未保存配置"],
      [403, "forbidden", "令牌没有读取绑定清单的权限，未保存配置"],
    ] as const) {
      const saveConfig = vi.fn()
      await expect(runSetup({ url: "https://example.test", token: "dd_bad" }, {
        env: {}, cliPath: "/tmp/cli.js", saveConfig,
        createClient: () => ({ getBindings: async () => { throw new RecorderHttpError(status, kind, "denied") } }),
      })).rejects.toThrow(message)
      expect(saveConfig).not.toHaveBeenCalled()
    }
  })
})
