import { createServer, type Server } from "node:http"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { BriefingResponse, BriefingTask } from "../../../../src/sync/recorder-protocol"
import { fetchBriefing, formatBriefing } from "./briefing"

const temporaryDirectories: string[] = []
const credentials = { url: "https://server.example/", token: "secret", source: "config" as const }

afterEach(() => {
  vi.unstubAllGlobals()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-briefing-"))
  temporaryDirectories.push(directory)
  return directory
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("HTTP test server did not bind to a TCP port")
  return address.port
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return
  const closed = new Promise<void>((resolve) => server.close(() => resolve()))
  server.closeAllConnections()
  await closed
}

function localCredentials(port: number) {
  return { ...credentials, url: `http://127.0.0.1:${port}` }
}

function task(code: string, title: string, overrides: Partial<BriefingTask> = {}): BriefingTask {
  return {
    code, title, status: "todo", priority: 2, estimateMin: 30, plannedFor: null, dueOn: null, ...overrides,
  }
}

describe("session briefing", () => {
  it("requests over HTTP with bearer auth, caches case-insensitively, and refreshes after expiry", async () => {
    const home = makeTempDir()
    const bodies: Array<BriefingResponse & { more?: { plannedToday: number; overdue: number; open: number } }> = [
      { bound: true, today: "2025-03-05", plannedToday: [], overdue: [], open: [], more: { plannedToday: 2, overdue: 0, open: 0 } },
      { bound: true, today: "2025-03-06", plannedToday: [], overdue: [], open: [] },
    ]
    const requests: Array<{ method?: string; url?: string; authorization?: string }> = []
    const server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization })
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(bodies[requests.length === 1 ? 0 : 1]))
    })
    const port = await listen(server)
    try {
      const local = localCredentials(port)
      await expect(fetchBriefing(local, "MyProject", { home, now: 1_000_000 })).resolves.toEqual(bodies[0])
      expect(requests[0]).toEqual({
        method: "GET", url: "/api/recorder/briefing?dir=MyProject", authorization: "Bearer secret",
      })

      await expect(fetchBriefing(local, "myproject", { home, now: 1_599_999 })).resolves.toEqual(bodies[0])
      expect(requests).toHaveLength(1)
      expect(JSON.parse(readFileSync(join(home, "briefing-cache.json"), "utf8"))).toHaveProperty("myproject")

      await expect(fetchBriefing(local, "MYPROJECT", { home, now: 1_600_000 })).resolves.toEqual(bodies[1])
      expect(requests).toHaveLength(2)
    } finally {
      await closeServer(server)
    }
  })

  it("returns null for HTTP errors and malformed response bodies", async () => {
    const home = makeTempDir()
    let requestCount = 0
    const server = createServer((_request, response) => {
      requestCount += 1
      if (requestCount === 1) {
        response.writeHead(503)
        response.end("unavailable")
      } else if (requestCount === 2) {
        response.writeHead(200)
        response.end("not json")
      } else {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(JSON.stringify({ bound: true, today: "2025-03-05", plannedToday: "bad", overdue: [], open: [] }))
      }
    })
    const port = await listen(server)
    try {
      for (const now of [10, 11, 12]) {
        await expect(fetchBriefing(localCredentials(port), "Project", { home, now })).resolves.toBeNull()
      }
      expect(requestCount).toBe(3)
    } finally {
      await closeServer(server)
    }
  })

  it("returns null promptly when the server refuses the connection", async () => {
    const home = makeTempDir()
    const server = createServer()
    const port = await listen(server)
    await closeServer(server)
    await expect(fetchBriefing(localCredentials(port), "Project", { home, now: 10 })).resolves.toBeNull()
  })

  it("destroys a request at its deadline when the server accepts but never answers", async () => {
    const home = makeTempDir()
    const server = createServer(() => undefined)
    const port = await listen(server)
    try {
      await expect(fetchBriefing(localCredentials(port), "Project", { home, timeoutMs: 40, now: 10 })).resolves.toBeNull()
    } finally {
      await closeServer(server)
    }
  })

  it("keeps the final commit-reference reminder when long briefing lines exceed the limit", () => {
    const longTask = task("T-1", "长标题".repeat(200))
    const briefing: BriefingResponse = {
      bound: true,
      today: "2025-03-05",
      project: { id: "p", name: "项目".repeat(200), stage: "running" },
      plannedToday: [longTask],
      overdue: [longTask],
      open: [longTask],
    }
    const text = formatBriefing(briefing)
    expect(Array.from(text).length).toBeLessThanOrEqual(1200)
    expect(text.split("\n").at(-1)).toContain("提交说明里写 Closes T-1")
  })

  it("keeps truncation counts visible and adds a notice when context lines do not fit", () => {
    const briefing: BriefingResponse & { more: { plannedToday: number; overdue: number; open: number } } = {
      bound: true,
      today: "2025-03-05",
      project: { id: "p", name: "Project", stage: "running" },
      plannedToday: [task("T-1", "Planned", { plannedFor: "2025-03-05" })],
      overdue: [task("T-2", "Overdue", { dueOn: "2025-03-01" })],
      open: [task("T-3", "Open")],
      more: { plannedToday: 2, overdue: 3, open: 4 },
    }
    const text = formatBriefing(briefing)
    expect(text).toContain("今天计划（另有 2 项）：T-1 Planned")
    expect(text).toContain("已逾期（另有 3 项）：T-2 Overdue")
    expect(text).toContain("其他没做完的（另有 4 项）：T-3 Open")

    const long = formatBriefing({
      ...briefing,
      project: { id: "p", name: "项目".repeat(300), stage: "running" },
      plannedToday: [task("T-141", "长标题".repeat(300))],
      overdue: [],
      open: [],
    })
    expect(long).toContain("简报有内容未显示")
    expect(Array.from(long).length).toBeLessThanOrEqual(1200)
    expect(long.split("\n").at(-1)).toContain("提交说明里写 Closes T-141")
  })

  it("lists unfinished milestones ahead of the other open tasks and reminds about ticking one after a release", () => {
    const text = formatBriefing({
      bound: true,
      today: "2025-03-05",
      project: { id: "p", name: "模板站", stage: "running" },
      plannedToday: [],
      overdue: [],
      open: [task("T-3", "Open")],
      milestones: [{ title: "v0.2 发布", due: "2025-03-20" }, { title: "上线推广", due: "2025-04-01" }],
    })
    expect(text).toContain("待完成的里程碑：v0.2 发布（截止 03-20）；上线推广（截止 04-01）")
    expect(text.indexOf("待完成的里程碑")).toBeLessThan(text.indexOf("其他没做完的"))
    const lines = text.split("\n")
    expect(lines.at(-2)).toContain("complete_milestone")
    expect(lines.at(-2)).toContain("先问用户")
    expect(lines.at(-1)).toContain("Closes T-141")
  })

  it("shows how many unfinished milestones were left out of the list", () => {
    const text = formatBriefing({
      bound: true,
      today: "2025-03-05",
      project: { id: "p", name: "Project", stage: "running" },
      plannedToday: [],
      overdue: [],
      open: [],
      milestones: [{ title: "v1", due: "2025-04-01" }],
      more: { plannedToday: 0, overdue: 0, open: 0, milestones: 3 },
    })
    expect(text).toContain("待完成的里程碑（另有 3 项）：v1（截止 04-01）")
  })

  it("says nothing about milestones when there are none pending", () => {
    const text = formatBriefing({
      bound: true,
      today: "2025-03-05",
      project: { id: "p", name: "Project", stage: "running" },
      plannedToday: [],
      overdue: [],
      open: [task("T-3", "Open")],
    })
    expect(text).not.toContain("里程碑")
    expect(text).not.toContain("complete_milestone")
  })

  it("keeps the milestone line and both reminders within 1200 characters when the task lists are long", () => {
    const longTask = task("T-1", "长标题".repeat(300))
    const text = formatBriefing({
      bound: true,
      today: "2025-03-05",
      project: { id: "p", name: "Project", stage: "running" },
      plannedToday: [longTask],
      overdue: [task("T-2", "长标题".repeat(300), { dueOn: "2025-03-01" })],
      open: [task("T-3", "长标题".repeat(300))],
      milestones: [{ title: "v0.2 发布", due: "2025-03-20" }],
    })
    expect(Array.from(text).length).toBeLessThanOrEqual(1200)
    expect(text).toContain("待完成的里程碑：v0.2 发布（截止 03-20）")
    expect(text).toContain("complete_milestone")
    expect(text.split("\n").at(-1)).toContain("Closes T-141")
  })

  it("accepts milestones from the server and rejects malformed ones", async () => {
    const home = makeTempDir()
    const bodies: unknown[] = [
      {
        bound: true, today: "2025-03-05", plannedToday: [], overdue: [], open: [],
        milestones: [{ title: "v1", due: "2025-04-01" }],
        more: { plannedToday: 0, overdue: 0, open: 0, milestones: 2 },
      },
      { bound: true, today: "2025-03-05", plannedToday: [], overdue: [], open: [], milestones: [{ title: 1 }] },
      { bound: true, today: "2025-03-05", plannedToday: [], overdue: [], open: [], more: { plannedToday: 0, overdue: 0, open: 0, milestones: -1 } },
    ]
    let served = 0
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(bodies[served++]))
    })
    const port = await listen(server)
    try {
      const local = localCredentials(port)
      await expect(fetchBriefing(local, "ok", { home, now: 1_000_000 })).resolves.toEqual(bodies[0])
      await expect(fetchBriefing(local, "bad-milestone", { home, now: 1_000_001 })).resolves.toBeNull()
      await expect(fetchBriefing(local, "bad-count", { home, now: 1_000_002 })).resolves.toBeNull()
    } finally {
      await closeServer(server)
    }
  })

  it("returns an empty string for an unbound directory", () => {
    expect(formatBriefing({ bound: false, today: "2025-03-05", plannedToday: [], overdue: [], open: [] })).toBe("")
  })


  it("formats tasks by section, skips duplicates, and caps the complete context at 1200 characters", () => {
    const open = Array.from({ length: 20 }, (_, index) => task(`T-${200 + index}`, `Open task ${index}`))
    const briefing: BriefingResponse = {
      bound: true,
      today: "2025-03-05",
      project: { id: "p", name: "Project", stage: "running" },
      plannedToday: [task("T-141", "Ship hook", { priority: 4, estimateMin: 45, plannedFor: "2025-03-05" })],
      overdue: [task("T-142", "Fix cache", { dueOn: "2025-02-28" })],
      open: [task("T-141", "Ship hook duplicate"), task("T-142", "Fix cache duplicate"), ...open],
    }
    const text = formatBriefing(briefing)
    expect(text).toContain("DeverDesk · 副业「Project」（运营中）")
    expect(text).toContain("今天计划：T-141 Ship hook（45m，紧急）")
    expect(text).toContain("已逾期：T-142 Fix cache（截止 02-28）")
    expect(text).not.toContain("duplicate")
    expect(text).toContain("T-214 Open task 14")
    expect(text).not.toContain("T-215 Open task 15")
    expect(text).toContain("Closes T-141")
    expect(Array.from(text).length).toBeLessThanOrEqual(1200)
  })
})
