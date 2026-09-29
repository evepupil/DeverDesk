import { createLocalStorage } from "./local"
import type { WorkbenchStorage } from "./types"

export type { Snapshot, StoredMeta, WorkbenchStorage } from "./types"

/**
 * 当前用的存储方式。在线版的云端存储接上之前（路线图 M2），两个版本都存在浏览器里。
 */
export function createStorage(): WorkbenchStorage {
  return createLocalStorage()
}
