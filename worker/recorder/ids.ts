import { RECORDER_ENTRY_ID_PREFIX, RECORDER_TASK_ID_PREFIX } from "../../src/sync/recorder-protocol"

async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function recorderTaskId(key: string): Promise<string> {
  return `${RECORDER_TASK_ID_PREFIX}${(await hashKey(key)).slice(0, 16)}`
}

export async function recorderEntryId(key: string): Promise<string> {
  return `${RECORDER_ENTRY_ID_PREFIX}${(await hashKey(key)).slice(0, 16)}`
}
