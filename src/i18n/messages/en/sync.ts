import type { Messages } from "../types"

export const sync: Messages["sync"] = {
  syncing: "Syncing",
  synced: "Synced",
  offline: "Offline",
  offlinePending: (n) => `Offline, ${n} ${n === 1 ? "change" : "changes"} will upload once back online`,
  errorHint: (message) => `${message}. Tap to retry`,
  syncError: "Sync error",
  failed: "Sync failed, try again later",
  writeFailed: "Couldn't write sync data on this device",
  cursorStuck: "Cloud sync cursor didn't advance",
  cacheFailed: "Couldn't write the cloud cache on this device",
}
