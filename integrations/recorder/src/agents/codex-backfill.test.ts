import { createWriteStream, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { once } from "node:events"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { backfillCodex } from "./codex-backfill"
import type { BackfillOptions, BackfillStats } from "./claude-code-backfill"
import type { CommitFinder, CommitInfo, DirNameResolver, RecorderEvent } from "../core/types"

const fixtureRoot = fileURLToPath(new URL("./__fixtures__/codex", import.meta.url))
const temporaryDirectories: string[] = []
const sinceAll = Date.parse("2025-02-02T00:00:00.000Z")
const untilAll = Date.parse("2025-02-03T00:00:00.000Z")
const uuidA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const uuidB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const uuidLoose = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-codex-backfill-"))
  temporaryDirectories.push(directory)
  return directory
}

function emptyStats(): BackfillStats {
  return { files: 0, sessions: 0, events: 0, skippedFiles: 0 }
}

function options(root: string, overrides: Partial<BackfillOptions> = {}): BackfillOptions {
  const resolveDir: DirNameResolver = async (cwd) => ({ dir: cwd.split("/").at(-1) || "root" })
  const findCommits: CommitFinder = async () => []
  return { root, since: sinceAll, until: untilAll, resolveDir, findCommits, ...overrides }
}

async function collect(input: BackfillOptions): Promise<{ events: RecorderEvent[]; stats: BackfillStats }> {
  const stats = emptyStats()
  const events: RecorderEvent[] = []
  for await (const event of backfillCodex(input, stats)) events.push(event)
  return { events, stats }
}

function writeCodexFile(root: string, date: string, filenameId: string, rows: unknown[]): string {
  const [year = "", month = "", day = ""] = date.split("-")
  const directory = join(root, year, month, day)
  mkdirSync(directory, { recursive: true })
  const filePath = join(directory, `rollout-${date}T10-00-00-000Z-${filenameId}.jsonl`)
  writeFileSync(filePath, `${rows.map((row) => typeof row === "string" ? row : JSON.stringify(row)).join("\n")}\n`, "utf8")
  return filePath
}

function metaRow(sessionId: string | undefined, cwd: string | undefined, timestamp = "2025-02-02T10:00:00.000Z"): Record<string, unknown> {
  return {
    type: "session_meta",
    timestamp,
    ordinal: 0,
    payload: { ...(sessionId ? { id: sessionId } : {}), ...(cwd ? { cwd } : {}) },
    metadata: {},
  }
}

function eventRow(type: string, timestamp: string): Record<string, unknown> {
  return { type: "event_msg", timestamp, ordinal: 1, payload: { type }, metadata: {} }
}

async function writeLargeJsonl(filePath: string, prefix: string, targetBytes: number): Promise<void> {
  const stream = createWriteStream(filePath)
  let written = 0
  const prefixBuffer = Buffer.from(prefix)
  stream.write(prefixBuffer)
  written += prefixBuffer.length
  const block = Buffer.from(`{"type":"response_item","padding":"${"x".repeat(4096)}"}\n`)
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

describe("backfillCodex", () => {
  it("restores session start, task boundaries, and ignores unrelated response items", async () => {
    const { events, stats } = await collect(options(fixtureRoot))
    expect(stats).toEqual({ files: 1, sessions: 1, events: 6, skippedFiles: 0 })
    expect(events.map((event) => [event.kind, event.t])).toEqual([
      ["start", Date.parse("2025-02-02T09:59:00.000Z")],
      ["prompt", Date.parse("2025-02-02T09:59:00.000Z")],
      ["prompt", Date.parse("2025-02-02T10:01:00.000Z")],
      ["stop", Date.parse("2025-02-02T10:05:00.000Z")],
      ["prompt", Date.parse("2025-02-02T10:10:00.000Z")],
      ["stop", Date.parse("2025-02-02T10:20:00.000Z")],
    ])
    expect(events[0]).toMatchObject({ session: "codex-session-1", source: "backfill", cwd: "/workspace/codex-repo", dir: "codex-repo" })
    expect(events.filter((event) => event.kind === "prompt").every((event) => event.text === undefined)).toBe(true)
    expect(events.every((event) => event.v === 1 && event.backfill === true && event.agent === "codex")).toBe(true)
  })

  it("filters events by since and until and excludes files dated more than one day earlier", async () => {
    const { events } = await collect(options(fixtureRoot, {
      since: Date.parse("2025-02-02T10:05:00.000Z"),
      until: Date.parse("2025-02-02T10:20:00.000Z"),
    }))
    expect(events.map((event) => [event.kind, event.t])).toEqual([
      ["stop", Date.parse("2025-02-02T10:05:00.000Z")],
      ["prompt", Date.parse("2025-02-02T10:10:00.000Z")],
    ])

    const oldRoot = makeTempDir()
    const oldFile = writeCodexFile(oldRoot, "2025-01-30", uuidA, [metaRow("old-session", "/workspace/old")])
    expect(oldFile).toContain(join("2025", "01", "30"))
    const oldResult = await collect(options(oldRoot, { since: Date.parse("2025-02-02T00:00:00.000Z") }))
    expect(oldResult.stats.files).toBe(0)
    expect(oldResult.events).toEqual([])

    const oneDayRoot = makeTempDir()
    writeCodexFile(oneDayRoot, "2025-02-01", uuidB, [metaRow("one-day-old", "/workspace/recent")])
    const oneDayResult = await collect(options(oneDayRoot, { since: Date.parse("2025-02-02T00:00:00.000Z") }))
    expect(oneDayResult.stats.files).toBe(1)
    expect(oneDayResult.events).toHaveLength(1)
    expect(oneDayResult.events[0]).toMatchObject({ session: "one-day-old", kind: "start" })
  })

  it("uses metadata session ids and falls back to the filename UUID", async () => {
    const root = makeTempDir()
    writeCodexFile(root, "2025-02-02", uuidA, [
      metaRow("metadata-session-id", "/workspace/meta"),
      eventRow("task_started", "2025-02-02T10:01:00.000Z"),
    ])
    writeCodexFile(root, "2025-02-02", uuidB, [
      metaRow(undefined, "/workspace/fallback"),
      eventRow("task_started", "2025-02-02T10:02:00.000Z"),
    ])
    writeCodexFile(root, "2025-02-02", uuidLoose, [
      {
        ...metaRow(undefined, "/workspace/session-id-alias"),
        payload: { session_id: "metadata-session-id-alias", cwd: "/workspace/session-id-alias" },
      },
      eventRow("task_started", "2025-02-02T10:03:00.000Z"),
    ])
    const { events, stats } = await collect(options(root))
    expect(stats.sessions).toBe(3)
    expect(events.filter((event) => event.kind === "prompt").map((event) => event.session)).toEqual([
      "metadata-session-id",
      uuidB,
      "metadata-session-id-alias",
    ])
  })

  it("splits files into sessions and attributes overlapping commits once, omitting non-git sessions", async () => {
    const root = makeTempDir()
    const writeSession = (id: string, filenameId: string, cwd: string, prompt: string, stop: string) => writeCodexFile(root, "2025-02-02", filenameId, [
      metaRow(id, cwd, `2025-02-02T${prompt}:00.000Z`),
      eventRow("task_started", `2025-02-02T${prompt}:00.000Z`),
      eventRow("task_complete", `2025-02-02T${stop}:00.000Z`),
    ])
    writeSession("session-a", uuidA, "/work/a", "10:00", "10:30")
    writeSession("session-b", uuidB, "/work/b", "10:20", "10:40")
    writeSession("session-loose", uuidLoose, "/work/loose", "10:05", "10:15")
    writeSession("session-c", "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "/work/c", "11:00", "11:10")

    const makeCommit = (sha: string, time: string): CommitInfo => ({
      sha,
      committedAt: Date.parse(`2025-02-02T${time}:00.000Z`),
      authoredAt: 1,
      authorEmail: "synthetic@example.invalid",
      subject: `Synthetic ${sha}`,
      body: "synthetic body",
      additions: 1,
      deletions: 0,
      files: 1,
    })
    const findCommits = vi.fn<CommitFinder>(async () => [
      makeCommit("only-a", "10:10"),
      makeCommit("overlap", "10:25"),
      makeCommit("tail-b", "10:50"),
      makeCommit("outside", "10:56"),
    ])
    const resolveDir: DirNameResolver = async (cwd) => cwd === "/work/loose"
      ? { dir: "Loose" }
      : { dir: cwd.split("/").at(-1) ?? "", repo: "/git/codex-shared" }
    const { events, stats } = await collect(options(root, { resolveDir, findCommits }))
    const commits = events.filter((event) => event.kind === "commit")
    expect(stats.sessions).toBe(4)
    expect(findCommits).toHaveBeenCalledOnce()
    expect(findCommits).toHaveBeenCalledWith("/git/codex-shared", Date.parse("2025-02-02T10:00:00.000Z"), Date.parse("2025-02-02T11:25:00.000Z"))
    expect(commits.map((event) => [event.session, event.sha])).toEqual([
      ["session-a", "only-a"],
      ["session-b", "overlap"],
      ["session-b", "tail-b"],
      ["", "outside"],
    ])
    expect(commits.find((event) => event.sha === "overlap")).toMatchObject({ dir: "b", cwd: "/work/b", repo: "/git/codex-shared" })
    expect(commits.find((event) => event.sha === "outside")).toMatchObject({ session: "", dir: "b", cwd: "/work/b", repo: "/git/codex-shared" })
  })

  it("skips files without a usable cwd, malformed rows, and files with an overlong line", async () => {
    const root = makeTempDir()
    const missingCwd = writeCodexFile(root, "2025-02-02", uuidA, [
      eventRow("task_started", "2025-02-02T10:01:00.000Z"),
    ])
    expect(missingCwd).toContain(uuidA)
    const badPath = join(root, "2025", "02", "02", `rollout-2025-02-02T11-00-00-000Z-${uuidB}.jsonl`)
    writeFileSync(badPath, Buffer.alloc(8 * 1024 * 1024 + 1, 0x78))
    const goodPath = writeCodexFile(root, "2025-02-02", uuidLoose, [
      metaRow("good-session", "/workspace/good"),
      "{\"type\":\"event_msg\",broken json",
      eventRow("task_started", "2025-02-02T10:02:00.000Z"),
    ])
    expect(goodPath).toContain(uuidLoose)

    const { events, stats } = await collect(options(root))
    expect(events.map((event) => [event.session, event.kind])).toContainEqual(["good-session", "start"])
    expect(events.map((event) => [event.session, event.kind])).toContainEqual(["good-session", "prompt"])
    expect(stats).toMatchObject({ files: 3, sessions: 1, skippedFiles: 2 })
  })

  it("streams a 30 MB file within memory and time limits", async () => {
    const root = makeTempDir()
    const yearDir = join(root, "2025", "02", "02")
    mkdirSync(yearDir, { recursive: true })
    const filePath = join(yearDir, `rollout-2025-02-02T10-00-00-000Z-${uuidA}.jsonl`)
    const prefix = `${JSON.stringify(metaRow("large-session", "/workspace/large"))}\n`
    await writeLargeJsonl(filePath, prefix, 30 * 1024 * 1024)

    const baseline = process.memoryUsage().rss
    let peak = baseline
    const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 2)
    const started = performance.now()
    let eventCount = 0
    try {
      for await (const event of backfillCodex(options(root), emptyStats())) {
        void event
        eventCount += 1
      }
    } finally {
      clearInterval(sample)
    }
    const elapsedMs = performance.now() - started
    peak = Math.max(peak, process.memoryUsage().rss)
    const memoryDelta = peak - baseline
    expect(eventCount).toBe(1)
    expect(memoryDelta).toBeLessThan(60 * 1024 * 1024)
    expect(elapsedMs).toBeLessThan(5000)
    console.log(`[backfill perf] Codex 30 MiB: peak RSS delta ${(memoryDelta / 1024 / 1024).toFixed(1)} MiB, ${elapsedMs.toFixed(0)} ms`)
  }, 15000)
})
