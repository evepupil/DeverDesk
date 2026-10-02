import { UPLOAD_MAX_CHANGES } from "../../src/sync/recorder-protocol"
import { createD1DataSource } from "../mcp/data/d1"
import { apiError, jsonResponse, readJsonBody } from "../http"
import type { TokenIdentity, WorkerEnv } from "../types"
import { getRecorderBindings } from "./bindings"
import { getRecorderBriefing } from "./briefing"
import { getRecorderLive, putRecorderLive } from "./live"
import { validateLiveRequest, validateUploadRequest } from "./validate"
import { uploadRecorderTasks, UploadConflictError, UploadLimitError } from "./upload"

export type RecorderRoute =
  | { kind: "bindings" }
  | { kind: "briefing" }
  | { kind: "upload" }
  | { kind: "live-get" }
  | { kind: "live-put" }

export function matchRecorderRoute(pathname: string, method: string): RecorderRoute | null {
  if (pathname === "/api/recorder/bindings" && method === "GET") return { kind: "bindings" }
  if (pathname === "/api/recorder/briefing" && method === "GET") return { kind: "briefing" }
  if (pathname === "/api/recorder/upload" && method === "POST") return { kind: "upload" }
  if (pathname === "/api/recorder/live" && method === "GET") return { kind: "live-get" }
  if (pathname === "/api/recorder/live" && method === "PUT") return { kind: "live-put" }
  return null
}

function isWriteRoute(route: RecorderRoute): boolean {
  return route.kind === "upload" || route.kind === "live-put"
}

export async function handleRecorderRoute(
  request: Request,
  env: WorkerEnv,
  identity: TokenIdentity,
  route: RecorderRoute,
  now: () => number = Date.now,
): Promise<Response> {
  if (isWriteRoute(route) && identity.tier !== "write") {
    return apiError("这个令牌需要开启直接改权限", 403)
  }

  if (route.kind === "bindings") return jsonResponse(await getRecorderBindings(createD1DataSource(env.DB)))

  if (route.kind === "briefing") {
    const dir = new URL(request.url).searchParams.get("dir")
    if (dir === null || dir.trim().length === 0 || dir.length > 60) return apiError("dir 必须是 1–60 字符的目录名", 400)
    const result = await getRecorderBriefing(createD1DataSource(env.DB), dir, now())
    return jsonResponse(result)
  }

  if (route.kind === "live-get") return jsonResponse(await getRecorderLive(env.DB, now()))

  const parsed = await readJsonBody(request)
  if (!parsed.ok) return parsed.response

  if (route.kind === "live-put") {
    const validation = validateLiveRequest(parsed.value, now())
    if (!validation.ok) return apiError(validation.error, 400)
    const projects = (await createD1DataSource(env.DB).projects()).map(({ value }) => value)
    await putRecorderLive(env.DB, projects, validation.value, now())
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
  }

  const validation = validateUploadRequest(parsed.value, now())
  if (!validation.ok) return apiError(validation.error, 400)
  try {
    const result = await uploadRecorderTasks(env.DB, createD1DataSource(env.DB), identity, validation.value, now())
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof UploadLimitError) return apiError(`一次上传最多产生 ${UPLOAD_MAX_CHANGES} 条改动`, 400)
    if (error instanceof UploadConflictError) return apiError(error.message, 409)
    throw error
  }
}
