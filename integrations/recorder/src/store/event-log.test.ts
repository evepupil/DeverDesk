import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildSync } from "esbuild"
import { afterEach, describe, expect, it } from "vitest"
import { appendEvent, readEvents } from "./event-log"
import type { CommitEvent, DoneEvent, PromptEvent, StartEvent } from "../core/types"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-event-log-"))
  temporaryDirectories.push(directory)
  return directory
}

function bundle(outputPath: string): void {
  const entry = join(process.cwd(), "integrations/recorder/src/store/event-log.ts")
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

function prompt(t: number, session: string, text?: string): PromptEvent {
  return { v: 1, t, agent: "claude-code", session, dir: "Demo", cwd: "/demo", kind: "prompt", ...(text ? { text } : {}) }
}

describe("event log", () => {
  it("appends by UTC date, skips bad rows, deduplicates commits globally, and stably sorts events", () => {
    const home = makeTempDir()
    const older = prompt(Date.parse("2025-03-01T23:59:00Z"), "s1", "first")
    const newer: StartEvent = { v: 1, t: Date.parse("2025-03-02T00:01:00Z"), agent: "codex", session: "s2", dir: "Demo", cwd: "/demo", kind: "start" }
    const firstCommit: CommitEvent = {
      v: 1, t: Date.parse("2025-03-02T00:02:00Z"), agent: "claude-code", session: "window-a", dir: "Demo", cwd: "/demo",
      kind: "commit", repo: "/repo", sha: "abc", subject: "same", additions: 1, deletions: 0, files: 1, authoredAt: 4,
    }
    const duplicateCommit: CommitEvent = { ...firstCommit, session: "window-b", subject: "different" }
    appendEvent(home, newer)
    appendEvent(home, firstCommit)
    appendEvent(home, duplicateCommit)
    appendEvent(home, older)
    const currentFile = join(home, "events", "2025-03-02.jsonl")
    appendFileSync(currentFile, "not json\n{\"v\":1\n", "utf8")

    const result = readEvents(home, {})
    expect(result.map((event) => [event.kind, event.t])).toEqual([
      ["prompt", older.t], ["start", newer.t], ["commit", firstCommit.t],
    ])
    expect(result.at(-1)).toMatchObject({ session: "window-a", subject: "same" })
    expect(readdirSync(join(home, "events")).sort()).toEqual(["2025-03-01.jsonl", "2025-03-02.jsonl"])
  })

  it("reads recent filenames with one extra day and truncates large payload fields under 4 KB", () => {
    const home = makeTempDir()
    const now = Date.parse("2025-03-05T12:00:00Z")
    appendEvent(home, prompt(Date.parse("2025-03-03T23:59:00Z"), "edge"))
    appendEvent(home, prompt(Date.parse("2025-03-02T12:00:00Z"), "old"))
    expect(readEvents(home, { days: 1, now }).map((event) => event.session)).toEqual(["edge"])

    const large = prompt(now, "large", "你".repeat(5000))
    appendEvent(home, large)
    const saved = readEvents(home, { days: 1, now }).find((event) => event.session === "large")
    expect(saved?.kind).toBe("prompt")
    expect(Buffer.byteLength(JSON.stringify(saved) + "\n", "utf8")).toBeLessThanOrEqual(4000)
    expect(saved?.kind === "prompt" ? saved.text?.length : 0).toBeGreaterThan(0)
    expect(saved?.kind === "prompt" ? saved.text?.length : 0).toBeLessThan(5000)
  })

  it("truncates title fields and never throws when an event cannot fit", () => {
    const home = makeTempDir()
    const done: DoneEvent = {
      v: 1, t: Date.parse("2025-03-03T00:00:00Z"), agent: "codex", session: "done", dir: "Demo", cwd: "/demo",
      kind: "done", title: "large title ".repeat(1000),
    }
    expect(() => appendEvent(home, done)).not.toThrow()
    const saved = readEvents(home, {})[0]
    expect(saved?.kind).toBe("done")
    expect(saved?.kind === "done" ? saved.title.length : 0).toBeLessThan(done.title.length)
    expect(Buffer.byteLength(readFileSync(join(home, "events", "2025-03-03.jsonl"), "utf8"))).toBeLessThanOrEqual(4000)

    const impossible: StartEvent = { ...done, kind: "start", cwd: "/" + "x".repeat(5000) }
    expect(() => appendEvent(home, impossible)).not.toThrow()
    expect(readFileSync(join(home, "logs", "recorder.log"), "utf8")).toContain("event dropped")
    expect(readEvents(home, {}).filter((event) => event.kind === "start")).toEqual([])

    const blocked = join(home, "not-a-directory")
    writeFileSync(blocked, "file")
    expect(() => appendEvent(blocked, prompt(Date.now(), "blocked"))).not.toThrow()
  })

  it("keeps concurrent process appends as 400 complete JSON lines", async () => {
    const home = makeTempDir()
    const bundled = join(home, "event-log.cjs")
    bundle(bundled)
    const code = `const {appendEvent}=require(${JSON.stringify(bundled)});const id=process.argv[1],home=process.argv[2];for(let n=0;n<50;n++)appendEvent(home,{v:1,t:1740787200000+n,agent:"claude-code",session:"worker-"+id,dir:"Demo",cwd:"/demo",kind:"prompt",text:"synthetic"})`
    await Promise.all(Array.from({ length: 8 }, (_, index) => runChild(code, [String(index), home])))
    const lines = readFileSync(join(home, "events", "2025-03-01.jsonl"), "utf8").trimEnd().split("\n")
    expect(lines).toHaveLength(400)
    expect(lines.map((line) => JSON.parse(line) as unknown)).toHaveLength(400)
    expect(readEvents(home, {}).length).toBe(400)
  }, 15000)
})
