import { armFailureSimulation, loadVersioned, saveVersioned } from "../persistence"
import type { Snapshot, WorkbenchStorage } from "./types"

/** 浏览器里存数据用的键和格式版本；格式有不兼容的改动时版本加一，旧数据不再读取 */
const KEY = "deverdesk:data"
const VERSION = 1

/** 本地存储：整份数据写进浏览器；地址栏带 ?fail=save 时第一次保存会故意失败 */
export function createLocalStorage(): WorkbenchStorage {
  armFailureSimulation()
  return {
    kind: "local",
    load: () => loadVersioned<Snapshot>(KEY, VERSION),
    save: (next) => saveVersioned(KEY, VERSION, next),
  }
}
