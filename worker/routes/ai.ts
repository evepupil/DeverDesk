// 页面使用的 AI 改动包接口；令牌身份在 routes/index.ts 中统一拒绝。
import type { ChangesetActionResponse, ChangesetListResponse } from "../../src/sync/protocol"
import { ChangesetError } from "../mcp/types"
import { apiError, jsonResponse, readJsonBody } from "../http"
import type { WorkerEnv } from "../types"
import { createChangesetService } from "../ai/changesets"
import { InvalidCursorError } from "../ai/store"

export type AiRoute =
  | { kind: "list" }
  | { kind: "action"; id: string; action: "accept" | "reject" | "undo" }

export function matchAiRoute(pathname: string, method: string): AiRoute | null {
  if (pathname === "/api/ai/changesets" && method === "GET") return { kind: "list" }
  if (method !== "POST") return null
  const match = pathname.match(/^\/api\/ai\/changesets\/([^/]+)\/(accept|reject|undo)$/)
  if (!match) return null
  try {
    return { kind: "action", id: decodeURIComponent(match[1]), action: match[2] as "accept" | "reject" | "undo" }
  } catch {
    return null
  }
}

function businessError(error: ChangesetError): Response {
  switch (error.code) {
    case "not_found": return apiError("改动包不存在", 404)
    case "wrong_status": return apiError("改动包状态已变化，无法执行此操作", 409)
    case "expired": return apiError("预览已过期", 409)
    case "forbidden": return apiError("没有权限执行此操作", 403)
    case "rate_limited": return apiError("改动太频繁，请稍后再试", 429, error.retryAfter ?? 1)
    case "too_many": return apiError("一次最多提交 20 条改动", 400)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function parseUndoSeqs(request: Request): Promise<{ ok: true; seqs?: number[] } | { ok: false; response: Response }> {
  if (!request.body) return { ok: true }
  const body = await readJsonBody(request)
  if (!body.ok) return body
  if (!isObject(body.value)) return { ok: false, response: apiError("请求体格式不正确", 400) }
  if (body.value.seqs === undefined) return { ok: true }
  if (!Array.isArray(body.value.seqs) || body.value.seqs.length > 20 ||
      body.value.seqs.some((seq) => !Number.isSafeInteger(seq) || (seq as number) < 0)) {
    return { ok: false, response: apiError("seqs 必须是非负整数数组", 400) }
  }
  return { ok: true, seqs: body.value.seqs as number[] }
}

export async function handleAiRoute(request: Request, env: WorkerEnv, route: AiRoute): Promise<Response> {
  try {
    const service = createChangesetService(env.DB)
    if (route.kind === "list") {
      const url = new URL(request.url)
      const status = url.searchParams.get("status")
      if (status !== "pending" && status !== "all") return apiError("status 必须是 pending 或 all", 400)
      const limitText = url.searchParams.get("limit")
      const limit = limitText === null ? 20 : /^\d+$/.test(limitText) ? Number(limitText) : Number.NaN
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) return apiError("limit 必须是 1–50 的整数", 400)
      const cursor = url.searchParams.get("cursor")
      const result: ChangesetListResponse = await service.list({ status, limit, ...(cursor === null ? {} : { cursor }) })
      return jsonResponse(result)
    }

    let result: ChangesetActionResponse
    if (route.action === "undo") {
      const parsed = await parseUndoSeqs(request)
      if (!parsed.ok) return parsed.response
      result = await service.undoByUser(route.id, parsed.seqs)
    } else if (route.action === "accept") {
      result = await service.accept(route.id)
    } else {
      result = await service.reject(route.id)
    }
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof ChangesetError) return businessError(error)
    if (error instanceof InvalidCursorError || error instanceof RangeError) return apiError("请求参数不正确", 400)
    throw error
  }
}
