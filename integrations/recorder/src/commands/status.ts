import { readFileSync } from "node:fs"
import { join } from "node:path"
import { dirNameKey } from "../../../../src/domain/dir-names"
import { computeTasks as computeTasksDefault } from "../core/engine"
import type { ComputedTask, RecorderEvent } from "../core/types"
import { loadCredentials as loadCredentialsDefault, type Credentials } from "../store/config"
import { readEvents as readEventsDefault } from "../store/event-log"
import { readState as readStateDefault, readUploadedKeys as readUploadedKeysDefault, type RecorderState } from "../store/state"

export interface StatusData {
  dir: string
  repo?: string
  bound: boolean
  project?: { id: string; name: string }
  credentials: "env" | "plugin" | "config" | "none"
  lastHook?: RecorderState["lastHook"]
  lastSync?: RecorderState["lastSync"]
  pendingTasks: number
}

export interface StatusDependencies {
  cwd: string
  home: string
  env: Record<string, string | undefined>
  now?: number
  resolveDirName(cwd: string): Promise<{ dir: string; repo?: string }>
  loadCredentials?(home: string, env: Record<string, string | undefined>): Credentials | null
  readBindings?(home: string): { dir: string; projectId: string; projectName: string }[]
  readEvents?(home: string, options: { days?: number; now?: number }): RecorderEvent[]
  compute?(events: readonly RecorderEvent[], now: number): { tasks: ComputedTask[] }
  readState?(home: string): RecorderState
  readUploadedKeys?(home: string): { done: Set<string>; rejected: Map<string, string> }
}

function readBindingsFile(home: string): { dir: string; projectId: string; projectName: string }[] {
  try {
    const value: unknown = JSON.parse(readFileSync(join(home, "bindings.json"), "utf8"))
    if (typeof value !== "object" || value === null || !("bindings" in value) || !Array.isArray(value.bindings)) return []
    return value.bindings.filter((item): item is { dir: string; projectId: string; projectName: string } =>
      typeof item === "object" && item !== null && typeof item.dir === "string" && typeof item.projectId === "string" && typeof item.projectName === "string")
  } catch {
    return []
  }
}

function credentialsSource(credentials: Credentials | null): StatusData["credentials"] {
  return credentials?.source ?? "none"
}

export async function runStatus(options: { json?: boolean }, dependencies: StatusDependencies): Promise<{ data: StatusData; output: string }> {
  const now = dependencies.now ?? Date.now()
  const resolved = await dependencies.resolveDirName(dependencies.cwd)
  const bindings = (dependencies.readBindings ?? readBindingsFile)(dependencies.home)
  const binding = bindings.find((item) => dirNameKey(item.dir) === dirNameKey(resolved.dir))
  const credentials = (dependencies.loadCredentials ?? loadCredentialsDefault)(dependencies.home, dependencies.env)
  const state = (dependencies.readState ?? readStateDefault)(dependencies.home)
  const uploaded = (dependencies.readUploadedKeys ?? readUploadedKeysDefault)(dependencies.home)
  const events = (dependencies.readEvents ?? readEventsDefault)(dependencies.home, { now })
  const computed = (dependencies.compute ?? computeTasksDefault)(events, now)
  const boundDirs = new Set(bindings.map((item) => dirNameKey(item.dir)))
  const pendingTasks = computed.tasks.filter((task) =>
    boundDirs.has(dirNameKey(task.dir)) && !uploaded.done.has(task.key) && !uploaded.rejected.has(task.key)).length
  const data: StatusData = {
    dir: resolved.dir,
    ...(resolved.repo === undefined ? {} : { repo: resolved.repo }),
    bound: binding !== undefined,
    ...(binding === undefined ? {} : { project: { id: binding.projectId, name: binding.projectName } }),
    credentials: credentialsSource(credentials),
    ...(state.lastHook === undefined ? {} : { lastHook: state.lastHook }),
    ...(state.lastSync === undefined ? {} : { lastSync: state.lastSync }),
    pendingTasks,
  }
  if (options.json) return { data, output: JSON.stringify(data, null, 2) }

  const lines = [
    `目录：${data.dir}${data.repo ? `（仓库 ${data.repo}）` : ""}`,
    data.bound ? `绑定：${data.project?.name ?? "已绑定"}` : "绑定：未绑定",
    `凭据：${data.credentials === "none" ? "没有" : data.credentials}`,
    `待上传任务：${data.pendingTasks}`,
    `最近钩子：${data.lastHook ? `${new Date(data.lastHook.at).toLocaleString()} ${data.lastHook.agent} ${data.lastHook.event}` : "尚无"}`,
    `最近同步：${data.lastSync ? `${data.lastSync.ok ? "成功" : "失败"}${data.lastSync.message ? `（${data.lastSync.message}）` : ""}` : "尚无"}`,
  ]
  return { data, output: lines.join("\n") }
}
