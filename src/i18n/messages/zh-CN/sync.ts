/** sync 的界面文字 */
export const sync = {
  /** 窗口栏里的同步状态（sync-indicator.tsx） */
  syncing: "正在同步",
  synced: "已同步",
  offline: "离线",
  offlinePending: (n: number) => `离线，${n} 条改动联网后上传`,
  /** 出错时的一句话，点一下重试 */
  errorHint: (message: string) => `${message}，点一下重试`,
  syncError: "同步出错",
  /** 同步引擎出错时给人看的话（state/storage/cloud.ts） */
  failed: "同步失败，请稍后重试",
  writeFailed: "本地同步数据写入失败",
  cursorStuck: "云端同步游标没有前进",
  cacheFailed: "本地云端缓存写入失败",
}
