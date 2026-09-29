import { EDITION } from "@/lib/edition"
import { createCloudStorage } from "./cloud"
import { createLocalStorage } from "./local"
import type { WorkbenchStorage } from "./types"

export type { Snapshot, StorageSink, StoredMeta, WorkbenchStorage } from "./types"

/**
 * 根据打包版本选择存储方式：在线版使用浏览器缓存和云端同步，本地版整份数据保存在浏览器。
 */
export function createStorage(): WorkbenchStorage {
  return EDITION === "cloud" ? createCloudStorage() : createLocalStorage()
}
