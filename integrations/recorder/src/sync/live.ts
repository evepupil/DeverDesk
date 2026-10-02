import { dirNameKey } from "../../../../src/domain/dir-names"
import type { LiveRequest, LiveWindow } from "../../../../src/sync/recorder-protocol"
import type { OpenWindow } from "../core/types"
import type { RecorderState } from "../store/state"
import type { RecorderClient } from "../upload/client"

export interface LiveSyncState {
  readState(home: string): RecorderState
  updateState(home: string, update: (state: RecorderState) => RecorderState | void): Promise<RecorderState>
}

export interface SyncLiveInput {
  home: string
  now: number
  windows: readonly OpenWindow[]
  bindings: readonly { dir: string }[]
  client: Pick<RecorderClient, "putLive">
  state: LiveSyncState
}

function fingerprint(windows: readonly LiveWindow[]): string {
  return windows
    .map((window) => `${window.session}:${window.since}:${window.minutes}`)
    .sort((left, right) => left.localeCompare(right))
    .join("|")
}

export async function syncLive(input: SyncLiveInput): Promise<boolean> {
  const boundDirs = new Set(input.bindings.map((binding) => dirNameKey(binding.dir)))
  const windows: LiveWindow[] = input.windows
    .filter((window) => boundDirs.has(dirNameKey(window.dir)))
    .slice(0, 20)
    .map((window) => ({ ...window }))
  const nextFingerprint = fingerprint(windows)
  const lastLive = input.state.readState(input.home).lastLive

  if (windows.length === 0 && (!lastLive || lastLive.fingerprint === nextFingerprint)) return false
  if (lastLive?.fingerprint === nextFingerprint && input.now - lastLive.at < 60_000) return false

  await input.client.putLive({ windows } satisfies LiveRequest)
  await input.state.updateState(input.home, (state) => ({
    ...state,
    lastLive: { at: input.now, fingerprint: nextFingerprint },
  }))
  return true
}
