import { request } from "@/lib/api"
import { RECORDER_PATHS, type LiveResponse } from "@/sync/recorder-protocol"

export function getLiveWindows(): Promise<LiveResponse> {
  return request<LiveResponse>(RECORDER_PATHS.live)
}
