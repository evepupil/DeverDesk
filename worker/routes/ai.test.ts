import { describe, expect, it } from "vitest"
import { createTestD1 } from "../testing/d1-sqlite.mjs"
import { createToken } from "../db/tokens"
import { dispatchApi } from "./index"
import type { WorkerEnv } from "../types"

function context(access = false) {
  return { waitUntil() {}, passThroughOnException() {}, ...(access ? { access: true } : {}) } as unknown as ExecutionContext
}

function envFor(DB: D1Database): WorkerEnv {
  return { DB, DEVERDESK_PASSWORD: "configured" } as WorkerEnv
}

describe("AI and token permission routes", () => {
  it("updates token tiers only for a browser session and applies the default proposal tier", async () => {
    const db = createTestD1()
    const env = envFor(db)
    const ctx = context(true)
    const response = await dispatchApi(
      new Request("https://example.test/api/tokens", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Default" }),
      }), env, ctx,
    )
    expect(response.status).toBe(201)
    const created = await response.json() as { id: string; tier: string }
    expect(created.tier).toBe("propose")

    const patch = await dispatchApi(
      new Request(`https://example.test/api/tokens/${created.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "write" }),
      }), env, ctx,
    )
    expect(patch.status).toBe(200)
    expect(await patch.json()).toEqual({ id: created.id, tier: "write" })
    expect(db.rows<{ tier: string }>("SELECT tier FROM tokens WHERE id = ?", created.id)).toEqual([{ tier: "write" }])

    const viaToken = await createToken(db, "Cannot patch", "write")
    const denied = await dispatchApi(
      new Request(`https://example.test/api/tokens/${viaToken.id}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${viaToken.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "read" }),
      }), env, context(),
    )
    expect(denied.status).toBe(403)
  })

  it("rejects every API token from page changeset endpoints", async () => {
    const db = createTestD1()
    for (const tier of ["read", "propose", "write"] as const) {
      const token = await createToken(db, `Token ${tier}`, tier)
      const response = await dispatchApi(
        new Request("https://example.test/api/ai/changesets?status=all", {
          headers: { Authorization: `Bearer ${token.token}` },
        }),
        envFor(db),
        context(),
      )
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: "个人令牌不能管理 AI 改动" })
    }
  })

  it("limits create and sync writes to write-tier tokens and records task creation", async () => {
    const db = createTestD1()
    const env = envFor(db)
    const ctx = context()
    const propose = await createToken(db, "Proposer", "propose")
    const blockedTask = await dispatchApi(
      new Request("https://example.test/api/tasks", {
        method: "POST", headers: { Authorization: `Bearer ${propose.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Blocked" }),
      }), env, ctx,
    )
    expect(blockedTask.status).toBe(403)
    const blockedPush = await dispatchApi(
      new Request("https://example.test/api/sync", {
        method: "POST", headers: { Authorization: `Bearer ${propose.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ changes: [] }),
      }), env, ctx,
    )
    expect(blockedPush.status).toBe(403)

    const writer = await createToken(db, "Writer", "write")
    const created = await dispatchApi(
      new Request("https://example.test/api/tasks", {
        method: "POST", headers: { Authorization: `Bearer ${writer.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Tracked task" }),
      }), env, ctx,
    )
    expect(created.status).toBe(201)
    const body = await created.json() as { task: { id: string; seq: number; origin: string } }
    expect(body.task).toMatchObject({ seq: 101, origin: "ai" })
    expect(db.rows<{ status: string; tool: string }>(
      "SELECT status, tool FROM ai_changesets WHERE token_id = ?", writer.id,
    )).toEqual([{ status: "applied", tool: "rest:tasks" }])
    expect(db.rows<{ source: string }>("SELECT source FROM records WHERE kind = 'task' AND id = ?", body.task.id))
      .toEqual([{ source: "api" }])

    const browserCreated = await dispatchApi(
      new Request("https://example.test/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Browser task" }),
      }), env, context(true),
    )
    expect(browserCreated.status).toBe(201)
    expect(db.rows<{ token_id: string | null }>(
      "SELECT token_id FROM ai_changesets WHERE tool = 'rest:tasks' AND token_id IS NULL",
    )).toHaveLength(1)
  })
})
