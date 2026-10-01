import { afterAll, beforeAll, beforeEach, vi } from "vitest"
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from "@modelcontextprotocol/server"
import { createToken } from "../db/tokens"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { handleMcpRequest } from "./index"
import { ChangesetError, ToolInputError } from "./types"
import type { ChangesetService, Clock, DataSource, SubmitInput, SubmitResult, ToolDefinition, TokenIdentity } from "./types"
import type { McpDependencies } from "./deps"
import type { ReadTool, WriteTool, ChangesTool } from "./types"
import type { WorkerEnv } from "../types"

declare const process: { env: { TZ?: string } }

export const FIXED_NOW = Date.UTC(2026, 9, 2, 12)
const PROFILE = {
  name: "Test",
  weekdayMin: 240,
  weekendMin: 120,
  dayStartHour: 9,
  dayEndHour: 18,
  timeZone: "Asia/Shanghai",
}
export const fixedClock: Clock = {
  timeZone: "Asia/Shanghai",
  timeZoneKnown: true,
  now: FIXED_NOW,
  today: "2026-10-02",
  dayOf: () => "2026-10-02",
  startOfDay: () => FIXED_NOW,
  toWall: (value) => value,
  fromWall: (value) => value,
  parseLocal: () => FIXED_NOW,
  formatLocal: () => "2026-10-02 20:00",
  formatLocalTime: () => "20:00",
  minuteOfDay: () => 1200,
}

function createEmptyDataSource(): DataSource {
  return {
    profile: async () => ({ value: PROFILE, updatedAt: FIXED_NOW, rev: 1 }),
    timer: async () => ({ value: null, updatedAt: null, rev: null }),
    projects: async () => [],
    routines: async () => [],
    notes: async () => [],
    tasks: async () => [],
    entries: async () => [],
    ledger: async () => [],
    record: async () => null,
  }
}

export function submitResult(input: SubmitInput): SubmitResult {
  const status = input.changes.length === 0
    ? "no_change"
    : input.token.tier === "propose"
      ? "proposed"
      : input.forcePreview
        ? "preview"
        : "applied"
  return {
    changesetId: status === "no_change" ? null : "cs-test",
    status,
    results: input.changes.map((change, seq) => ({
      seq,
      kind: change.kind,
      id: change.id,
      state: status === "applied" ? "applied" : "pending",
      after: change.after,
    })),
    conflicts: [],
  }
}

export function createService(submit: (input: SubmitInput) => Promise<SubmitResult>): ChangesetService {
  return {
    submit,
    confirm: async () => { throw new Error("unused") },
    undo: async () => { throw new Error("unused") },
    withdraw: async () => { throw new Error("unused") },
    accept: async () => { throw new Error("unused") },
    reject: async () => { throw new Error("unused") },
    undoByUser: async () => { throw new Error("unused") },
    list: async () => ({ changesets: [], pendingCount: 0, nextCursor: null }),
  }
}

function createFixtureTools(): ToolDefinition[] {
  const readTool: ReadTool<unknown> = {
    kind: "read",
    name: "get_day",
    title: "Get day",
    description: "Read the selected day. Use it to inspect the user's daily workspace.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string" }, issue: { type: "string" } },
      additionalProperties: false,
    },
    run: async (context, input) => {
      const args = input as { date?: string; issue?: string }
      if (args.issue === "bad") throw new ToolInputError("The requested date is outside the supported range.")
      if (args.issue === "unexpected") throw new Error("private internal detail")
      return {
        date: args.date ?? context.clock.today,
        timeZone: context.clock.timeZone,
        token: context.token,
        generatedId: context.newId("test"),
      }
    },
  }
  const addTasks: WriteTool<unknown> = {
    kind: "write",
    name: "add_tasks",
    title: "Add tasks",
    description: "Create tasks. Use it when the user asks to add tasks.",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "integer", minimum: 0, maximum: 30 },
        reason: { type: "string" },
      },
      required: ["count"],
      additionalProperties: false,
    },
    destructive: false,
    plan: async (_context, input) => {
      const args = input as { count: number; reason?: string }
      return {
        changes: Array.from({ length: args.count }, (_, index) => ({
          kind: "task" as const,
          id: `t-${index}`,
          action: "create" as const,
          before: null,
          beforeUpdatedAt: null,
          beforeRev: null,
          after: { title: `Task ${index}` },
        })),
        output: { planned: args.count },
        warnings: ["A possible duplicate was skipped."],
        reason: args.reason ?? null,
      }
    },
    present: (_context, plan, result) => ({ created: result.results.length, planned: plan.changes.length }),
  }
  const deleteRecords: WriteTool<unknown> = {
    ...addTasks,
    name: "delete_records",
    title: "Delete records",
    destructive: true,
    alwaysPreview: true,
  }
  const manageChanges: ChangesTool<unknown> = {
    kind: "changes",
    name: "manage_changes",
    title: "Manage changes",
    description: "Manage this token's changes. Use it to confirm, undo, or withdraw changes.",
    inputSchema: { type: "object", properties: { action: { type: "string" } }, required: ["action"] },
    run: async (context, _changesets, input) => ({
      tokenId: context.token.id,
      action: (input as { action: string }).action,
    }),
  }
  return [readTool, addTasks, deleteRecords, manageChanges]
}

export const fixtureTools = createFixtureTools()
export const dataSourceFactory = vi.fn(() => createEmptyDataSource())
export const clockFactory = vi.fn(() => fixedClock)
export const submit = vi.fn(async (input: SubmitInput) => submitResult(input))
const changesetService = createService(async (input) => submit(input))
export const dependencies: McpDependencies = {
  tools: fixtureTools,
  createDataSource: dataSourceFactory,
  createClock: clockFactory,
  createChangesetService: vi.fn(() => changesetService),
  now: () => FIXED_NOW,
  newId: (prefix) => `${prefix}-injected`,
}

let environment: WorkerEnv
let tokenValues: Record<TokenIdentity["tier"], string>

export function installMcpTestHooks(): void {
  beforeAll(async () => {
    process.env.TZ = "UTC"
    const database = createTestD1()
    environment = { DB: database } as unknown as WorkerEnv
    tokenValues = {
      read: (await createToken(database, "Read client", "read", FIXED_NOW)).token,
      propose: (await createToken(database, "Proposal client", "propose", FIXED_NOW)).token,
      write: (await createToken(database, "Write client", "write", FIXED_NOW)).token,
    }
  })
  beforeEach(() => vi.clearAllMocks())
  afterAll(() => vi.restoreAllMocks())
}

export function testEnv(): WorkerEnv {
  return environment
}

export function testTokens(): Record<TokenIdentity["tier"], string> {
  return tokenValues
}

export function legacyRequest(token: string, message: Record<string, unknown>, init: RequestInit = {}): Request {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  })
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return new Request("https://desk.test/mcp", {
    ...init,
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" || init.method === "DELETE" ? undefined : JSON.stringify(message),
  })
}

export function modernRequest(token: string, message: Record<string, unknown>, method: string): Request {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": method,
  }
  const params = message.params
  if (method === "tools/call" && typeof params === "object" && params !== null && "name" in params && typeof params.name === "string") {
    headers["Mcp-Name"] = params.name
  }
  return new Request("https://desk.test/mcp", { method: "POST", headers, body: JSON.stringify(message) })
}

export function modernEnvelope(): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
    [CLIENT_CAPABILITIES_META_KEY]: {},
    [CLIENT_INFO_META_KEY]: { name: "mcp-test", version: "1.0.0" },
  }
}

export async function jsonRpcResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  const json = text.startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
  if (!json) throw new Error(`MCP response did not contain JSON: ${text}`)
  return JSON.parse(json) as Record<string, unknown>
}

export function resultOf(response: Record<string, unknown>): Record<string, unknown> {
  return response.result as Record<string, unknown>
}

export async function send(
  request: Request,
  deps = dependencies,
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const response = await handleMcpRequest(request, testEnv(), deps)
  return { response, body: await jsonRpcResponse(response) }
}

export { ChangesetError, ToolInputError }
