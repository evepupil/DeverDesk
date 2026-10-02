import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildSync } from "esbuild"
import { afterEach, describe, expect, it } from "vitest"
import { loadCredentials, saveConfig } from "./config"
import { withLock } from "./lock"
import { recorderHome } from "./paths"
import { appendUploaded, emptyState, readState, readUploadedKeys, updateState } from "./state"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-store-"))
  temporaryDirectories.push(directory)
  return directory
}

function bundle(entry: string, outputPath: string): void {
  const result = buildSync({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", write: false })
  const output = result.outputFiles[0]
  if (!output) throw new Error("Expected esbuild output")
  writeFileSync(outputPath, output.contents)
}

function runChild(code: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", code, ...args], { stdio: "ignore", windowsHide: true })
    child.once("error", reject)
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Child exited with ${code}`)))
  })
}

describe("recorder local store", () => {
  it("uses DEVERDESK_HOME before the operating-system home", () => {
    expect(recorderHome({ DEVERDESK_HOME: " /tmp/custom-home " })).toBe("/tmp/custom-home")
    expect(recorderHome({})).toMatch(/\.deverdesk$/)
  })

  it("loads complete credential pairs in priority order and falls through incomplete pairs", () => {
    const home = makeTempDir()
    saveConfig(home, { url: " https://config.example/// ", token: "config-token" })
    expect(loadCredentials(home, {
      DEVERDESK_URL: " https://env.example/// ", DEVERDESK_TOKEN: "env-token",
      CLAUDE_PLUGIN_OPTION_SERVER_URL: "https://plugin.example", CLAUDE_PLUGIN_OPTION_TOKEN: "plugin-token",
    })).toEqual({ url: "https://env.example", token: "env-token", source: "env" })
    expect(loadCredentials(home, {
      DEVERDESK_URL: "https://ignored.example", CLAUDE_PLUGIN_OPTION_SERVER_URL: " https://plugin.example/ ",
      CLAUDE_PLUGIN_OPTION_TOKEN: "plugin-token",
    })).toEqual({ url: "https://plugin.example", token: "plugin-token", source: "plugin" })
    expect(loadCredentials(home, { DEVERDESK_TOKEN: "incomplete" })).toEqual({
      url: "https://config.example", token: "config-token", source: "config",
    })
    expect(loadCredentials(home, { DEVERDESK_URL: "ftp://bad", DEVERDESK_TOKEN: "bad" })).toMatchObject({ source: "config" })
    expect(loadCredentials(home, { DEVERDESK_URL: "https://missing-token.example" })).toMatchObject({ source: "config" })
  })

  it("saves config with restrictive permissions and ignores broken JSON", () => {
    const home = makeTempDir()
    saveConfig(home, { url: "https://example.test", token: "token" })
    expect(JSON.parse(readFileSync(join(home, "config.json"), "utf8"))).toEqual({ url: "https://example.test", token: "token" })
    if (process.platform !== "win32") expect(statSync(join(home, "config.json")).mode & 0o777).toBe(0o600)
    writeFileSync(join(home, "state.json"), "{")
    expect(readState(home)).toEqual(emptyState())
    writeFileSync(join(home, "state.json"), JSON.stringify({ v: 1, repos: {}, dirCache: {}, firstLiveEvent: {} }))
    expect(readState(home).sessionStarts).toEqual({})
  })

  it("cleans stale locks, refuses active locks, and releases locks after callback errors", async () => {
    const home = makeTempDir()
    const stale = join(home, "stale.lock")
    writeFileSync(stale, "orphan")
    const past = new Date(Date.now() - 20_000)
    utimesSync(stale, past, past)
    await expect(withLock(stale, 1000, async () => "recovered")).resolves.toEqual({ value: "recovered" })

    const active = join(home, "active.lock")
    writeFileSync(active, "someone else")
    await expect(withLock(active, 60_000, async () => "unexpected")).resolves.toBeNull()
    await expect(withLock(join(home, "throw.lock"), 1000, async () => { throw new Error("expected") })).rejects.toThrow("expected")
    expect(() => readFileSync(join(home, "throw.lock"))).toThrow()
  })

  it("cleans state temporary files older than ten minutes under the state lock", async () => {
    const home = makeTempDir()
    const stale = join(home, ".state-old.tmp")
    const recent = join(home, ".state-recent.tmp")
    writeFileSync(stale, "stale")
    writeFileSync(recent, "recent")
    const oldTime = new Date(Date.now() - 11 * 60_000)
    utimesSync(stale, oldTime, oldTime)

    await updateState(home, (state) => { state.lastHook = { at: 1, agent: "codex", event: "Stop", session: "s" } })
    expect(() => readFileSync(stale)).toThrow()
    expect(readFileSync(recent, "utf8")).toBe("recent")
  })

  it("logs and skips a state update when state.lock remains busy for three seconds", async () => {
    const home = makeTempDir()
    writeFileSync(join(home, "state.lock"), `${process.pid} ${Date.now()}\n`)
    const started = Date.now()
    await expect(updateState(home, (state) => { state.lastHook = { at: 1, agent: "codex", event: "Stop", session: "s" } })).resolves.toEqual(emptyState())
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900)
    expect(readFileSync(join(home, "logs", "recorder.log"), "utf8")).toContain("state.lock")
    expect(readState(home).lastHook).toBeUndefined()
  })

  it("reads uploaded keys while skipping damaged rows and applying the last status", () => {
    const home = makeTempDir()
    appendUploaded(home, [
      { k: "task-a", at: 10 },
      { k: "task-b", at: 11, rejected: "invalid" },
      { k: "task-b", at: 12 },
    ])
    const file = join(home, "uploaded.jsonl")
    writeFileSync(file, `${readFileSync(file, "utf8")}bad json\n{"k":3,"at":13}\n`, "utf8")
    const result = readUploadedKeys(home)
    expect([...result.done]).toEqual(["task-a", "task-b"])
    expect([...result.rejected]).toEqual([])
  })

  it("serializes state read-modify-write calls across four child processes", async () => {
    const home = makeTempDir()
    const output = join(home, "state-bundle.cjs")
    bundle(join(process.cwd(), "integrations/recorder/src/store/state.ts"), output)
    const code = `const {updateState}=require(${JSON.stringify(output)});(async()=>{const key=process.argv[1];for(let n=0;n<12;n++)await updateState(process.argv[2],s=>{s.dirCache[key]={dir:key,at:n}})})().catch(e=>{process.exitCode=1})`
    await Promise.all(Array.from({ length: 4 }, (_, index) => runChild(code, [`worker-${index}`, home])))
    const state = readState(home)
    expect(Object.keys(state.dirCache).sort()).toEqual(["worker-0", "worker-1", "worker-2", "worker-3"])
    expect(Object.values(state.dirCache).map((entry) => entry.at)).toEqual([11, 11, 11, 11])
  }, 15000)
})
