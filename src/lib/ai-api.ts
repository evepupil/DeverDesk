import { API_PATHS, type ChangesetActionResponse, type ChangesetListResponse, type UndoChangesetRequest } from "@/sync/protocol"
import { request } from "@/lib/api"

export type ChangesetListStatus = "pending" | "all"

export interface ListChangesetsOptions {
  status: ChangesetListStatus
  cursor?: string
  limit?: number
}

export function listChangesets({ status, cursor, limit }: ListChangesetsOptions): Promise<ChangesetListResponse> {
  const query = new URLSearchParams({ status })
  if (cursor !== undefined) query.set("cursor", cursor)
  if (limit !== undefined) query.set("limit", String(limit))
  return request<ChangesetListResponse>(`${API_PATHS.aiChangesets}?${query.toString()}`)
}

function actionPath(id: string, action: "accept" | "reject" | "undo"): string {
  return `${API_PATHS.aiChangesets}/${encodeURIComponent(id)}/${action}`
}

export function acceptChangeset(id: string): Promise<ChangesetActionResponse> {
  return request<ChangesetActionResponse>(actionPath(id, "accept"), { method: "POST" })
}

export function rejectChangeset(id: string): Promise<ChangesetActionResponse> {
  return request<ChangesetActionResponse>(actionPath(id, "reject"), { method: "POST" })
}

export function undoChangeset(id: string, seqs?: number[]): Promise<ChangesetActionResponse> {
  const body: UndoChangesetRequest = seqs ? { seqs } : {}
  return request<ChangesetActionResponse>(actionPath(id, "undo"), { method: "POST", body: JSON.stringify(body) })
}
