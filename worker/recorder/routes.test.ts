import { describe, expect, it, vi } from "vitest"
import type { Project, Task } from "../../src/domain/types"
import type { TestD1Database } from "../testing/d1-sqlite.d.mts"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { createToken } from "../db/tokens"
import { createChangesetService } from "../ai/changesets"
import { seedRecord } from "../ai/test-helpers"
import { dispatchApi } from "../routes/index"
import type { WorkerEnv } from "../types"

const NOW = Date.parse("2026-10-01T09:00:00.000Z")

function context(access = false) {
  return { waitUntil() {}, passThroughOnException() {}, ...(access ? { access: true } : {}) } as unknown as ExecutionContext
}

function envFor(DB: D1Database): WorkerEnv {
  return { DB, DEVERDESK_PASSWORD: "configured" } as WorkerEnv
}

function project(): Project {
  return {
    id: "project-recorder",
    name: "Recorder project",
    color: "blue",
    stage: "running",
    goal: "",
    startedOn: "2026-01-01",
    monthlyTarget: null,
    milestones: [],
    dirNames: ["Repo"],
  }
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    seq: 101,
    title: "Planned task",
    projectId: "project-recorder",
    status: "todo",
    priority: 2,
    estimateMin: 30,
    plannedFor: "2026-10-01",
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: NOW - 60_000,
    completedAt: null,
    ...overrides,
  }
}

function request(path: string, method = "GET", token?: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function seedProject(db: TestD1Database, withTask = false): Promise<void> {
  await seedRecord(db, "project", "project-recorder", project(), NOW - 10, 1)
  await seedRecord(db, "profile", "singleton", {
    name: "Tester", weekdayMin: 180, weekendMin: 360, dayStartHour: 8, dayEndHour: 24, timeZone: "UTC",
  }, NOW - 10, 2)
  if (withTask) await seedRecord(db, "task", "task-1", task(), NOW - 5, 3)
}

function raceOnFirstBatch(db: TestD1Database): D1Database {
  let injected = false
  return {
    prepare(sql: string) {
      return db.prepare(sql)
    },
    async batch(statements: D1PreparedStatement[]) {
      if (!injected) {
        injected = true
        await db.prepare("UPDATE records SET data = ?, updated_at = ?, rev = rev + 1 WHERE kind = 'task' AND id = ?")
          .bind(JSON.stringify(task({ title: "Concurrent edit", notes: "Concurrent notes" })), NOW + 1, "task-1").run()
      }
      return db.batch(statements)
    },
  } as unknown as D1Database
}

describe("recorder routes", () => {
  it("allows read-tier tokens to load bindings and a project briefing", async () => {
    const db = createTestD1()
    await seedProject(db, true)
    const reader = await createToken(db, "Reader", "read")
    const env = envFor(db)

    const now = vi.spyOn(Date, "now").mockReturnValue(NOW)
    try {
      const bindings = await dispatchApi(request("/api/recorder/bindings", "GET", reader.token), env, context())
      expect(bindings.status).toBe(200)
      expect(await bindings.json()).toEqual({ bindings: [
        { dir: "repo", projectId: "project-recorder", projectName: "Recorder project" },
      ] })

      const briefing = await dispatchApi(request("/api/recorder/briefing?dir=REPO", "GET", reader.token), env, context())
      expect(briefing.status).toBe(200)
      expect(await briefing.json()).toMatchObject({
        bound: true,
        today: "2026-10-01",
        project: { id: "project-recorder", name: "Recorder project", stage: "running" },
        plannedToday: [{ code: "T-101", title: "Planned task" }],
      })
    } finally {
      now.mockRestore()
    }
  })

  it("writes one atomic recorder changeset, deduplicates repeats, and preserves actual minutes", async () => {
    const db = createTestD1()
    await seedProject(db)
    const writer = await createToken(db, "Recorder token", "write")
    const env = envFor(db)
    const body = {
      client: { name: "Recorder CLI", version: "1.0.0", agent: "codex" },
      tasks: [{
        key: "repo:session:done",
        dir: "rEpO",
        title: "Implement feature",
        source: "done",
        finishedAt: NOW,
        commits: [{ sha: "0123456789abcdef", subject: "Implement feature" }],
        entries: [{ key: "repo:session:0", start: NOW - 120_000, end: NOW, minutes: 1 }],
      }],
    }

    const uploaded = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, body), env, context())
    expect(uploaded.status).toBe(200)
    const result = await uploaded.json() as { created: { tasks: number; entries: number }; changesetId: string; skipped: unknown[] }
    expect(result).toMatchObject({ created: { tasks: 1, entries: 1 }, skipped: [] })
    expect(result.changesetId).toBeTruthy()

    const changesets = db.rows<{ status: string; tool: string; client_name: string; reason: string }>(
      "SELECT status, tool, client_name, reason FROM ai_changesets WHERE id = ?", result.changesetId,
    )
    expect(changesets).toEqual([{ status: "applied", tool: "recorder", client_name: "Recorder token", reason: "编程自动记录" }])
    const tasks = db.rows<{ id: string; data: string }>("SELECT id, data FROM records WHERE kind = 'task' AND deleted = 0")
    const createdTask = JSON.parse(tasks[0].data) as Task
    expect(createdTask).toMatchObject({
      seq: 101,
      title: "Implement feature",
      projectId: "project-recorder",
      status: "done",
      completedAt: NOW,
      origin: "coding",
      notes: "0123456 Implement feature",
    })
    const entries = db.rows<{ data: string }>("SELECT data FROM records WHERE kind = 'entry' AND deleted = 0")
    expect(JSON.parse(entries[0].data)).toMatchObject({ minutes: 1, origin: "coding", taskId: tasks[0].id })
    expect(db.rows<{ state: string }>("SELECT state FROM ai_changes WHERE changeset_id = ?", result.changesetId))
      .toEqual([{ state: "applied" }, { state: "applied" }])

    const repeated = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, body), env, context())
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toEqual({
      created: { tasks: 0, entries: 0 },
      skipped: [{ key: "repo:session:done", reason: "duplicate" }],
      changesetId: null,
    })
    expect(db.rows("SELECT id FROM ai_changesets WHERE tool = 'recorder'")).toHaveLength(1)

    const undone = await createChangesetService(db, () => NOW).undo(
      { id: writer.id, name: writer.name, tier: writer.tier }, result.changesetId,
    )
    expect(undone.changeset.status).toBe("undone")
    expect(db.rows("SELECT id FROM records WHERE kind IN ('task', 'entry') AND deleted = 0")).toEqual([])
  })

  it("marks a taskSeq target done and binds a new entry to its project", async () => {
    const db = createTestD1()
    await seedProject(db, true)
    const writer = await createToken(db, "Writer", "write")
    const env = envFor(db)
    const body = {
      client: { name: "Recorder CLI", version: "1.0.0", agent: "codex" },
      tasks: [{
        key: "repo:session:task-seq",
        dir: "repo",
        title: "Existing task",
        source: "commit",
        finishedAt: NOW,
        commits: [{ sha: "abcdef0123456789", subject: "Finish existing task" }],
        taskSeq: 101,
        entries: [{ key: "repo:session:task-seq:entry", start: NOW - 120_000, end: NOW, minutes: 2 }],
      }],
    }

    const response = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, body), env, context())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ created: { tasks: 0, entries: 1 }, skipped: [] })
    const storedTask = JSON.parse(db.rows<{ data: string }>("SELECT data FROM records WHERE kind = 'task' AND id = 'task-1'")[0].data) as Task
    expect(storedTask).toMatchObject({ status: "done", completedAt: NOW, notes: "abcdef0 Finish existing task" })
    const storedEntry = JSON.parse(db.rows<{ data: string }>("SELECT data FROM records WHERE kind = 'entry'")[0].data)
    expect(storedEntry).toMatchObject({ taskId: "task-1", projectId: "project-recorder", minutes: 2 })
  })

  it("preserves oversized existing notes and only appends whole commit lines", async () => {
    const db = createTestD1()
    await seedProject(db, true)
    const original = "legacy note\n".repeat(220)
    await db.prepare("UPDATE records SET data = ? WHERE kind = 'task' AND id = 'task-1'")
      .bind(JSON.stringify(task({ notes: original }))).run()
    const writer = await createToken(db, "Writer", "write")
    const now = vi.spyOn(Date, "now").mockReturnValue(NOW)
    try {
      const response = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, {
        client: { name: "Recorder", version: "1", agent: "codex" },
        tasks: [{
          key: "notes-oversized", dir: "Repo", title: "Finish", source: "commit", finishedAt: NOW,
          taskSeq: 101, commits: [{ sha: "abcdef0", subject: "New commit" }], entries: [],
        }],
      }), envFor(db), context())
      expect(response.status).toBe(200)
      const stored = JSON.parse(db.rows<{ data: string }>("SELECT data FROM records WHERE kind = 'task' AND id = 'task-1'")[0].data) as Task
      expect(stored.notes).toBe(original)

      const nearLimit = "x".repeat(1_975)
      await db.prepare("UPDATE records SET data = ? WHERE kind = 'task' AND id = 'task-1'")
        .bind(JSON.stringify(task({ status: "todo", completedAt: null, notes: nearLimit }))).run()
      const second = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, {
        client: { name: "Recorder", version: "1", agent: "codex" },
        tasks: [{
          key: "notes-whole-lines", dir: "Repo", title: "Finish", source: "commit", finishedAt: NOW,
          taskSeq: 101,
          commits: [
            { sha: "abcdef0", subject: "🧪" },
            { sha: "1234567", subject: "second commit subject" },
            { sha: "7654321", subject: "x" },
          ],
          entries: [],
        }],
      }), envFor(db), context())
      expect(second.status).toBe(200)
      const updated = JSON.parse(db.rows<{ data: string }>("SELECT data FROM records WHERE kind = 'task' AND id = 'task-1'")[0].data) as Task
      expect(updated.notes).toBe(`${nearLimit}\nabcdef0 🧪`)
      expect(updated.notes.endsWith("\uD83D")).toBe(false)
    } finally {
      now.mockRestore()
    }
  })

  it("returns 409 when a task changes after the upload read", async () => {
    const db = createTestD1()
    await seedProject(db, true)
    const writer = await createToken(db, "Writer", "write")
    const now = vi.spyOn(Date, "now").mockReturnValue(NOW)
    try {
      const response = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, {
        client: { name: "Recorder", version: "1", agent: "codex" },
        tasks: [{
          key: "concurrent-task", dir: "Repo", title: "Finish", source: "commit", finishedAt: NOW,
          taskSeq: 101, commits: [{ sha: "abcdef0", subject: "Finish" }], entries: [],
        }],
      }), envFor(raceOnFirstBatch(db)), context())
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: "数据刚被改动，请稍后重试" })
      expect(JSON.parse(db.rows<{ data: string }>("SELECT data FROM records WHERE kind = 'task' AND id = 'task-1'")[0].data))
        .toMatchObject({ title: "Concurrent edit", notes: "Concurrent notes" })
    } finally {
      now.mockRestore()
    }
  })

  it("maps only the dedicated upload limit to 400 and logs unexpected storage failures as 500", async () => {
    const db = createTestD1()
    await seedProject(db)
    const writer = await createToken(db, "Writer", "write")
    const now = vi.spyOn(Date, "now").mockReturnValue(NOW)
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const tooMany = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, {
        client: { name: "Recorder", version: "1", agent: "codex" },
        tasks: [0, 1].map((taskIndex) => ({
          key: `bulk-${taskIndex}`, dir: "Repo", title: "Bulk", source: "done", finishedAt: NOW,
          commits: [],
          entries: Array.from({ length: 15 }, (_, index) => ({
            key: `bulk-${taskIndex}-${index}`, start: NOW - (index + 1) * 120_000,
            end: NOW - (index + 1) * 120_000 + 60_000, minutes: 1,
          })),
        })),
      }), envFor(db), context())
      expect(tooMany.status).toBe(400)

      const broken = {
        prepare: (sql: string) => db.prepare(sql),
        batch: async () => { throw new Error("storage unavailable") },
      } as unknown as D1Database
      const failed = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, {
        client: { name: "Recorder", version: "1", agent: "codex" },
        tasks: [{ key: "storage-failure", dir: "Repo", title: "Failure", source: "done", finishedAt: NOW, commits: [], entries: [] }],
      }), envFor(broken), context())
      expect(failed.status).toBe(500)
      expect(log).toHaveBeenCalledWith("API request failed", expect.any(Error))
    } finally {
      now.mockRestore()
      log.mockRestore()
    }
  })

  it("requires write-tier tokens for writes but permits an Access identity", async () => {
    const db = createTestD1()
    await seedProject(db)
    const env = envFor(db)
    const reader = await createToken(db, "Reader", "read")
    const body = { client: { name: "Recorder", version: "1", agent: "codex" }, tasks: [] }
    const denied = await dispatchApi(request("/api/recorder/upload", "POST", reader.token, body), env, context())
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: "这个令牌需要开启直接改权限" })

    const liveBody = { windows: [{ session: "session-1", dir: "repo", agent: "codex", since: NOW - 60_000, minutes: 1 }] }
    const now = vi.spyOn(Date, "now").mockReturnValue(NOW)
    try {
      const accepted = await dispatchApi(request("/api/recorder/live", "PUT", undefined, liveBody), env, context(true))
      expect(accepted.status).toBe(204)
      const live = await dispatchApi(request("/api/recorder/live", "GET", reader.token), env, context())
      expect(await live.json()).toMatchObject({ windows: [{ projectId: "project-recorder", projectName: "Recorder project" }], updatedAt: NOW })
    } finally {
      now.mockRestore()
    }
  })

  it("rejects malformed uploads and invalid briefing parameters", async () => {
    const db = createTestD1()
    const writer = await createToken(db, "Writer", "write")
    const env = envFor(db)
    const body = {
      client: { name: "Recorder", version: "1", agent: "codex" },
      tasks: [{
        key: "unknown-project-task", dir: "unbound", title: "Skip me", source: "idle", finishedAt: NOW,
        commits: [], entries: [],
      }],
    }
    const unbound = await dispatchApi(request("/api/recorder/upload", "POST", writer.token, body), env, context())
    expect(unbound.status).toBe(200)
    expect(await unbound.json()).toEqual({
      created: { tasks: 0, entries: 0 }, skipped: [{ key: "unknown-project-task", reason: "unbound" }], changesetId: null,
    })

    const malformed = { client: { name: "Recorder", version: "1", agent: "codex" }, tasks: [{ key: "bad" }] }
    expect((await dispatchApi(request("/api/recorder/upload", "POST", writer.token, malformed), env, context())).status).toBe(400)
    expect((await dispatchApi(request("/api/recorder/briefing", "GET", writer.token), env, context())).status).toBe(400)
  })
})
