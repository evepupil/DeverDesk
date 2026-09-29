// 实现按 rev 拉取记录和批量推送冲突同步接口。
import type { PullResponse, PushResponse } from "../../src/sync/protocol"
import { PULL_PAGE_SIZE } from "../../src/sync/protocol"
import { apiError, jsonResponse, readJsonBody } from "../http"
import type { WorkerEnv } from "../types"
import { pullRecords, pushRecords } from "../db/records"
import { validatePushRequest } from "../validation"

export async function pull(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url)
  const sinceText = url.searchParams.get("since")
  const since = sinceText === null ? 0 : Number(sinceText)
  if (!Number.isSafeInteger(since) || since < 0) return apiError("since 必须是非负整数", 400)

  const limitText = url.searchParams.get("limit")
  const limit = limitText === null ? PULL_PAGE_SIZE : Number(limitText)
  if (!Number.isInteger(limit) || limit < 1 || limit > PULL_PAGE_SIZE) {
    return apiError(`limit 必须是 1–${PULL_PAGE_SIZE} 的整数`, 400)
  }

  const records = await pullRecords(env.DB, since, limit)
  const response: PullResponse = {
    records,
    cursor: records.length > 0 ? records[records.length - 1].rev : since,
    more: records.length === limit,
  }
  return jsonResponse(response)
}

export async function push(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = validatePushRequest(body.value)
  if (!parsed.ok) return apiError(parsed.error, 400)
  const response: PushResponse = { rejected: await pushRecords(env.DB, parsed.value.changes) }
  return jsonResponse(response)
}
