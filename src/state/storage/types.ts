import type { DayKey, WorkbenchData } from "@/domain/types"

/** 数据的来历：还是不是样例、样例哪天生成的、有没有被改过 */
export interface StoredMeta {
  /** 还是样例数据 */
  sample: boolean
  /** 样例生成的日子 */
  seededOn: DayKey
  /** 样例数据被改过 */
  touched: boolean
}

/** 一份完整的数据：来历 + 全部记录 */
export interface Snapshot {
  meta: StoredMeta
  data: WorkbenchData
}

/**
 * 存储层：数据仓库只通过它读写，页面不直接碰存储。
 * - 本地版：整份写进浏览器。
 * - 在线版：先写浏览器里的缓存（打开快、断网能用），再把改动的记录排队传到云端。
 * 换存储方式只换这一层的实现，数据仓库和页面都不用改。
 */
/** 云端合并来的数据交回数据仓库的通道 */
export interface StorageSink {
  /** 用合并后的完整数据替换数据仓库里的数据；这一步不会再触发保存 */
  replace(next: Snapshot): void
}

export interface WorkbenchStorage {
  readonly kind: "local" | "cloud"
  /** 同步读出这台设备上保存的数据；第一次用、或者存的格式版本对不上时返回 null */
  load(): Snapshot | null
  /**
   * 保存一次修改后的完整数据，返回这台设备上有没有存上。
   * 在线版自己记着上一次交给它的那份，按对象是否相同找出改了哪几条记录去上传；
   * 所以即使这次没存上，改动也已经记下，之后重试只需要再写一次浏览器。
   */
  save(next: Snapshot): boolean
  /** 在线版：数据仓库建好后把交回数据的通道接上；本地版没有这一步 */
  connect?(sink: StorageSink): void
}
