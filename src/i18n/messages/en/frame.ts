import type { Messages } from "../types"

export const frame: Messages["frame"] = {
  windowBar: {
    openNav: "Open navigation",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    back: "Back",
    forward: "Forward",
    search: "Search",
    shortcuts: "Keyboard shortcuts",
  },
  pageFrame: {
    views: "Views",
  },
  display: {
    label: "Display",
    reset: "Reset to default",
  },
  filter: {
    label: "Filter",
    count: (n) => `${n} selected`,
    joiner: ", ",
    clearAria: (field) => `Clear ${field} filter`,
    clear: "Clear",
  },
  quickCapture: {
    label: "Quick capture",
    description: "Add a task for today, or log an income or expense",
    placeholder: "What's on today? e.g. Reply to comments 15m",
    income: "Log income",
    expense: "Log expense",
  },
  timerChip: {
    runningAria: (label, elapsed) => `Timer running: ${label}, ${elapsed} elapsed`,
    stop: "Stop timer",
    logged: (minutes) => `Logged ${minutes}`,
    tooShort: "Under a minute, nothing logged",
  },
  persistence: {
    saveFailed: "Couldn't save on this device",
    saveFailedHint: "Your changes are kept until you close the page",
    saved: "Saved on this device",
  },
  backup: {
    exported: "Backup file exported",
    importFailed: "Couldn't import",
    replaceTitle: (name) => `Replace current data with “${name}”?`,
    replaceBody: (tasks, entries) =>
      `The backup has ${tasks} ${tasks === 1 ? "task" : "tasks"} and ${entries} ${entries === 1 ? "entry" : "entries"}. Current data will be replaced, so export a copy first.`,
    replace: "Replace",
    imported: "Backup imported",
    parse: {
      invalidJson: "The file isn't valid JSON",
      notBackup: "This isn't a backup exported from the workbench",
      unknownVersion: "This backup version isn't recognized",
      noData: "The backup file has no data",
      missingList: (key) => `The backup file is missing “${key}”`,
      badProfile: "The backup file's schedule settings are incomplete",
    },
  },
}
