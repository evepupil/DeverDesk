import { createWriteStream, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { once } from "node:events"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { backfillClaudeCode, type BackfillOptions, type BackfillStats } from "./claude-code-backfill"
import { MAX_JSONL_LINE_BYTES } from "./backfill-common"
import type { CommitFinder, CommitInfo, DirNameResolver, RecorderEvent } from "../core/types"

const fixtureRoot = fileURLToPath(new URL("./__fixtures__/claude", import.meta.url))
const temporaryDirectories: string[] = []
const sinceAll = Date.parse("2025-02-01T00:00:00.000Z")
const untilAll = Date.parse("2025-02-03T00:00:00.000Z")

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-claude-backfill-"))
  temporaryDirectories.push(directory)
  return directory
}

function emptyStats(): BackfillStats {
  return { files: 0, sessions: 0, events: 0, skippedFiles: 0 }
}

function baseOptions(root: string, overrides: Partial<BackfillOptions> = {}): BackfillOptions {
  const resolveDir: DirNameResolver = async (cwd) => ({ dir: cwd.split("/").at(-1) || "root" })
  const findCommits: CommitFinder = async () => []
  return { root, since: sinceAll, until: untilAll, resolveDir, findCommits, ...overrides }
}

async function collect(options: BackfillOptions): Promise<{ events: RecorderEvent[]; stats: BackfillStats }> {
  const stats = emptyStats()
  const events: RecorderEvent[] = []
  for await (const event of backfillClaudeCode(options, stats)) events.push(event)
  return { events, stats }
}

function projectFile(root: string, name: string): string {
  const project = join(root, "project")
  mkdirSync(project, { recursive: true })
  return join(project, name)
}

function userRow(sessionId: string, timestamp: string, cwd: string, content: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: "user", timestamp, sessionId, cwd, message: { content }, ...extra }
}

function stopRow(sessionId: string, timestamp: string, cwd: string, stopReason = "end_turn"): Record<string, unknown> {
  return { type: "assistant", timestamp, sessionId, cwd, message: { stop_reason: stopReason } }
}

async function writeLargeJsonl(filePath: string, prefix: string, targetBytes: number): Promise<void> {
  const stream = createWriteStream(filePath)
  let written = 0
  const prefixBuffer = Buffer.from(prefix)
  stream.write(prefixBuffer)
  written += prefixBuffer.length
  const block = Buffer.from(`{"type":"ignored","padding":"${"x".repeat(4096)}"}\n`)
  while (written + block.length <= targetBytes) {
    if (!stream.write(block)) await once(stream, "drain")
    written += block.length
  }
  const remaining = targetBytes - written
  if (remaining > 0) stream.write(Buffer.alloc(remaining, 0x20))
  const closed = once(stream, "close")
  stream.end()
  await closed
}

describe("backfillClaudeCode", () => {
  it("restores qualifying prompts, stops, and starts while ignoring dirty rows and nested files", async () => {
    const { events, stats } = await collect(baseOptions(fixtureRoot))
    const main = events.filter((event) => event.session === "claude-main-session")
    expect(stats).toEqual({ files: 2, sessions: 2, events: 11, skippedFiles: 0 })
    expect(main.map((event) => [event.kind, event.t])).toEqual([
      ["start", Date.parse("2025-02-01T09:59:00.000Z")],
      ["prompt", Date.parse("2025-02-01T09:59:00.000Z")],
      ["prompt", Date.parse("2025-02-01T10:00:00.000Z")],
      ["stop", Date.parse("2025-02-01T10:10:00.000Z")],
      ["stop", Date.parse("2025-02-01T10:12:00.000Z")],
      ["prompt", Date.parse("2025-02-01T10:20:00.000Z")],
      ["stop", Date.parse("2025-02-01T10:30:00.000Z")],
      ["prompt", Date.parse("2025-02-01T10:40:00.000Z")],
    ])
    expect(main[0]).toMatchObject({ v: 1, agent: "claude-code", backfill: true, source: "backfill", cwd: "/workspace/early-repo", dir: "early-repo" })
    expect(main.every((event) => event.cwd === "/workspace/early-repo" && event.dir === "early-repo")).toBe(true)
    expect(main.filter((event) => event.kind === "prompt").map((event) => event.text)).toEqual([
      "Synthetic backdated prompt.",
      "Synthetic prompt one.",
      "Synthetic prompt two.",
      "Synthetic prompt after cwd change.",
    ])
    expect(events.some((event) => event.session === "subagent-must-not-appear" || event.session === "nested-must-not-appear")).toBe(false)
    expect(events.filter((event) => event.session === "claude-cross-day-session").map((event) => event.t)).toEqual([
      Date.parse("2025-02-01T23:55:00.000Z"),
      Date.parse("2025-02-01T23:55:00.000Z"),
      Date.parse("2025-02-02T00:10:00.000Z"),
    ])
    expect(events.every((event) => event.v === 1 && event.backfill === true && event.agent === "claude-code")).toBe(true)
  })

  it("filters event timestamps to the inclusive since and exclusive until bounds", async () => {
    const { events } = await collect(baseOptions(fixtureRoot, {
      since: Date.parse("2025-02-01T10:10:00.000Z"),
      until: Date.parse("2025-02-01T10:30:00.000Z"),
    }))
    expect(events.map((event) => [event.kind, event.t])).toEqual([
      ["stop", Date.parse("2025-02-01T10:10:00.000Z")],
      ["stop", Date.parse("2025-02-01T10:12:00.000Z")],
      ["prompt", Date.parse("2025-02-01T10:20:00.000Z")],
    ])
  })

  it("classifies legacy prompts, human-origin prompts, arrays, and all specified exclusions", async () => {
    const root = makeTempDir()
    const filePath = projectFile(root, "dirty.jsonl")
    const cwd = "/workspace/dirty-repo"
    const at = (minute: number) => `2025-02-01T10:${String(minute).padStart(2, "0")}:00.000Z`
    const rows = [
      userRow("dirty", "2025-02-01T09:58:00.000Z", cwd, "Synthetic forked line", { forkedFrom: "parent-session", origin: { kind: "human" } }),
      userRow("dirty", "2025-02-01T09:59:00.000Z", cwd, "Synthetic compact summary", { isCompactSummary: true }),
      userRow("dirty", at(0), cwd, "<system> synthetic directive"),
      userRow("dirty", at(1), cwd, "[Request interrupted by user] synthetic"),
      userRow("dirty", at(2), cwd, "Synthetic task notification", { origin: { kind: "task-notification" } }),
      userRow("dirty", at(3), cwd, "Synthetic unknown origin", { origin: { kind: "other" } }),
      userRow("dirty", at(4), cwd, "Synthetic null origin", { origin: null }),
      userRow("dirty", at(5), cwd, [{ type: "text", text: "Synthetic tool request." }, { type: "tool_result", content: "result" }], { origin: { kind: "human" } }),
      userRow("dirty", at(6), cwd, "Synthetic meta", { isMeta: true, origin: { kind: "human" } }),
      userRow("dirty", at(7), cwd, "Synthetic sidechain", { isSidechain: true, origin: { kind: "human" } }),
      userRow("dirty", at(8), cwd, 42, { origin: { kind: "human" } }),
      userRow("dirty", at(9), cwd, "Legacy ordinary prompt. Following sentence."),
      userRow("dirty", at(10), cwd, "Synthetic accepted prompt. Extra.", { origin: { kind: "human" } }),
      userRow("dirty", at(11), cwd, [{ type: "text", text: "Synthetic " }, { type: "image" }, { type: "text", text: "joined prompt." }], { origin: { kind: "human" } }),
      stopRow("dirty", at(12), cwd, "tool_use"),
      stopRow("dirty", at(13), cwd),
      { ...stopRow("dirty", at(14), cwd), requestId: "synthetic-request-id" },
      { ...stopRow("dirty", at(15), cwd), requestId: "synthetic-request-id" },
    ]
    writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")

    const { events } = await collect(baseOptions(root))
    expect(events.find((event) => event.kind === "start")).toMatchObject({ t: Date.parse(at(0)), cwd, dir: "dirty-repo" })
    expect(events.filter((event) => event.kind === "prompt").map((event) => event.text)).toEqual([
      "Legacy ordinary prompt.",
      "Synthetic accepted prompt.",
      "Synthetic joined prompt.",
    ])
    expect(events.filter((event) => event.kind === "stop").map((event) => event.t)).toEqual([
      Date.parse(at(13)),
      Date.parse(at(15)),
    ])
  })

  it("splits sessions, attributes commits once to the latest overlapping session, and omits non-git commits", async () => {
    const root = makeTempDir()
    const filePath = projectFile(root, "sessions.jsonl")
    const ts = (value: string) => `2025-02-01T${value}:00.000Z`
    const rows = [
      userRow("session-a", ts("10:00"), "/work/a", "Synthetic A", { origin: { kind: "human" } }),
      userRow("session-b", ts("10:20"), "/work/b", "Synthetic B", { origin: { kind: "human" } }),
      userRow("session-loose", ts("10:05"), "/work/loose", "Synthetic loose", { origin: { kind: "human" } }),
      userRow("session-c", ts("11:00"), "/work/c", "Synthetic C", { origin: { kind: "human" } }),
      stopRow("session-a", ts("10:30"), "/work/a"),
      stopRow("session-b", ts("10:40"), "/work/b"),
      stopRow("session-loose", ts("10:15"), "/work/loose"),
      stopRow("session-c", ts("11:10"), "/work/c"),
    ]
    writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")

    const commit = (sha: string, time: string): CommitInfo => ({
      sha,
      committedAt: Date.parse(`2025-02-01T${time}:00.000Z`),
      authoredAt: 1,
      authorEmail: "synthetic@example.invalid",
      subject: `Synthetic ${sha}`,
      body: "synthetic body",
      additions: 1,
      deletions: 0,
      files: 1,
    })
    const findCommits = vi.fn<CommitFinder>(async () => [
      commit("only-a", "10:10"),
      commit("overlap", "10:25"),
      commit("tail-b", "10:50"),
      commit("outside", "10:56"),
    ])
    const resolveDir: DirNameResolver = async (cwd) => {
      if (cwd === "/work/loose") return { dir: "Loose" }
      return { dir: cwd.split("/").at(-1) ?? "", repo: "/git/shared" }
    }
    const { events, stats } = await collect(baseOptions(root, { resolveDir, findCommits }))
    const commits = events.filter((event) => event.kind === "commit")
    expect(stats.sessions).toBe(4)
    expect(findCommits).toHaveBeenCalledOnce()
    expect(findCommits).toHaveBeenCalledWith("/git/shared", Date.parse(ts("10:00")), Date.parse("2025-02-01T11:25:00.000Z"))
    expect(commits.map((event) => [event.session, event.sha])).toEqual([
      ["session-a", "only-a"],
      ["session-b", "overlap"],
      ["session-b", "tail-b"],
      ["", "outside"],
    ])
    expect(commits.find((event) => event.sha === "overlap")).toMatchObject({ dir: "b", cwd: "/work/b", repo: "/git/shared" })
    expect(commits.find((event) => event.sha === "outside")).toMatchObject({ session: "", dir: "b", cwd: "/work/b", repo: "/git/shared" })
  })

  it("skips an overlong file and continues with other files", async () => {
    const root = makeTempDir()
    const badPath = projectFile(root, "a-too-long.jsonl")
    writeFileSync(badPath, Buffer.alloc(MAX_JSONL_LINE_BYTES + 1, 0x78))
    const goodPath = projectFile(root, "z-good.jsonl")
    const row = userRow("good", "2025-02-01T10:00:00.000Z", "/workspace/good", "Synthetic good prompt", { origin: { kind: "human" } })
    writeFileSync(goodPath, `${JSON.stringify(row)}\n`, "utf8")

    const { events, stats } = await collect(baseOptions(root))
    expect(events.some((event) => event.session === "good" && event.kind === "prompt")).toBe(true)
    expect(stats).toMatchObject({ files: 2, sessions: 1, skippedFiles: 1 })
  })

  it("streams a 30 MB file within memory and time limits", async () => {
    const root = makeTempDir()
    const filePath = projectFile(root, "large.jsonl")
    const row = userRow("large", "2025-02-01T10:00:00.000Z", "/workspace/large", "Synthetic large-file prompt", { origin: { kind: "human" } })
    const targetBytes = 30 * 1024 * 1024
    await writeLargeJsonl(filePath, `${JSON.stringify(row)}\n`, targetBytes)

    const baseline = process.memoryUsage().rss
    let peak = baseline
    const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 2)
    const started = performance.now()
    let eventCount = 0
    try {
      for await (const event of backfillClaudeCode(baseOptions(root), emptyStats())) {
        void event
        eventCount += 1
      }
    } finally {
      clearInterval(sample)
    }
    const elapsedMs = performance.now() - started
    peak = Math.max(peak, process.memoryUsage().rss)
    const memoryDelta = peak - baseline
    expect(eventCount).toBe(2)
    expect(memoryDelta).toBeLessThan(60 * 1024 * 1024)
    expect(elapsedMs).toBeLessThan(5000)
    console.log(`[backfill perf] Claude Code 30 MiB: peak RSS delta ${(memoryDelta / 1024 / 1024).toFixed(1)} MiB, ${elapsedMs.toFixed(0)} ms`)
  }, 15000)
})
