"use client"

import { create } from "zustand"

/**
 * 在线版的同步状态：给界面看的一小份状态，外加对同步引擎的几个调用入口。
 * 同步引擎由云端存储（storage/cloud.ts）创建并登记到这里，界面只通过这里的函数使用它，
 * 这样界面代码不直接依赖存储层的实现。本地版没有同步引擎，这些函数什么也不做。
 */

export type SyncStatus =
  /** 还没开始（本地版、或者还没登录） */
  | "idle"
  /** 正在上传或拉取 */
  | "syncing"
  /** 已经和云端一致 */
  | "synced"
  /** 连不上网，改动先留在这台设备上 */
  | "offline"
  /** 服务器出错 */
  | "error"
  /** 登录过期，需要重新登录 */
  | "unauthorized"

interface SyncState {
  status: SyncStatus
  /** 还没传到云端的改动条数 */
  pending: number
  /** 上一次和云端一致的时间 */
  lastSyncedAt: number | null
  /** 出错时给人看的一句话 */
  message: string | null
}

export const useSync = create<SyncState>()(() => ({
  status: "idle",
  pending: 0,
  lastSyncedAt: null,
  message: null,
}))

export function setSyncState(patch: Partial<SyncState>) {
  useSync.setState(patch)
}

export interface SyncEngine {
  /** 登录确认后开始：先拉取一次，再按需上传；之后切回页面、联网时自动同步 */
  start(): void
  /** 退出登录时停下 */
  stop(): void
  /** 立刻同步一次（点同步状态图标时） */
  syncNow(): Promise<void>
  /** 清掉这台设备上的缓存和待上传的改动（退出登录时） */
  clearLocal(): void
}

let engine: SyncEngine | null = null
/** 「开始同步」可能比引擎登记来得早（引擎跟数据仓库一起创建，工作台显示时才加载），先记下来 */
let startRequested = false

export function registerSyncEngine(next: SyncEngine) {
  engine = next
  if (startRequested) next.start()
}

export function startSync() {
  startRequested = true
  engine?.start()
}

export function stopSync() {
  startRequested = false
  engine?.stop()
}

export function syncNow(): Promise<void> {
  return engine?.syncNow() ?? Promise.resolve()
}

export function clearLocalData() {
  engine?.clearLocal()
}
