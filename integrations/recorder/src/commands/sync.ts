import { createClient, type RecorderClient } from "../upload/client"
import { loadCredentials as loadCredentialsDefault, type Credentials } from "../store/config"
import { recorderHome } from "../store/paths"
import { spawnBackgroundSync } from "../sync/spawn"
import { createDefaultSyncState, runSync, type SyncInput, type SyncOutcome } from "../sync/sync"
export interface SyncCommandOptions {
  all: boolean
  dryRun: boolean
  days?: number
  delayMs?: number
  settleLockPath?: string
}

export interface SyncCommandDependencies {
  env: Record<string, string | undefined>
  home?: string
  now?: number
  scriptPath?: string
  loadCredentials?(home: string, env: Record<string, string | undefined>): Credentials | null
  createClient?(credentials: Credentials | null): RecorderClient
  run?(input: SyncInput): Promise<SyncOutcome>
  state?: SyncInput["state"]
  readEvents?: SyncInput["readEvents"]
  compute?: SyncInput["compute"]
  spawnSync?(delayMs: number): void
}

function backgroundSync(scriptPath: string, env: Record<string, string | undefined>, delayMs: number): void {
  spawnBackgroundSync(process.execPath, scriptPath, { ...env, DEVERDESK_RECORDER_INTERNAL: "1" }, { delayMs })
}

export async function runSyncCommand(options: SyncCommandOptions, dependencies: SyncCommandDependencies): Promise<string> {
  const home = dependencies.home ?? recorderHome(dependencies.env)
  const creds = (dependencies.loadCredentials ?? loadCredentialsDefault)(home, dependencies.env)
  const client = (dependencies.createClient ?? ((value) => createClient({
    url: value?.url ?? "http://127.0.0.1",
    token: value?.token ?? "",
  })))(creds)
  const syncRunner = dependencies.run ?? runSync
  const input: SyncInput = {
    home,
    now: dependencies.now,
    creds,
    client,
    compute: dependencies.compute,
    readEvents: dependencies.readEvents,
    state: dependencies.state ?? createDefaultSyncState(),
    options: dependencies.env.DEVERDESK_RECORDER_SETTLE_LOCK && !options.settleLockPath
      ? { ...options, settleLockPath: dependencies.env.DEVERDESK_RECORDER_SETTLE_LOCK }
      : options,
    spawnSync: dependencies.spawnSync ?? ((delayMs) => {
      if (dependencies.scriptPath) backgroundSync(dependencies.scriptPath, dependencies.env, delayMs)
    }),
  }
  const result = await syncRunner(input)
  if (typeof result.skipped === "string") return "同步已在运行，跳过本次。"
  if (options.dryRun && result.error) {
    if (result.error === "未配置凭据") return result.error
    throw new Error(`同步失败：${result.error}`)
  }
  if (options.dryRun) {
    const keys = result.taskKeys ?? []
    const entries = result.entryKeys ?? []
    return `将上传 ${keys.length} 个任务、${entries.length} 段投入\n任务键：${keys.length ? keys.join("、") : "无"}\n时间段键：${entries.length ? entries.join("、") : "无"}`
  }
  if (result.error) throw new Error(`同步失败：${result.error}`)
  return `同步完成：上传 ${result.uploadedTasks} 个任务、${result.uploadedEntries} 段投入；跳过 ${result.skipped} 个，拒绝 ${result.rejected} 个。`
}
