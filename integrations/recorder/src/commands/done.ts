import { dirNameKey } from "../../../../src/domain/dir-names"
import type { Agent, DoneEvent, RecorderEvent } from "../core/types"
import { appendEvent as appendEventDefault, readEvents as readEventsDefault } from "../store/event-log"
import { loadCredentials } from "../store/config"

export interface DoneOptions {
  title: string
  session?: string
  agent?: Agent
}

export interface DoneDependencies {
  home: string
  cwd: string
  env: Record<string, string | undefined>
  now?: number
  resolveDirName(cwd: string): Promise<{ dir: string; repo?: string }>
  readEvents?(home: string, options: { now?: number }): RecorderEvent[]
  appendEvent?(home: string, event: DoneEvent): void
  spawnBackgroundSync(): void
}

function invalidTitle(): Error & { exitCode: number } {
  return Object.assign(new Error("标题不能为空"), { exitCode: 2 })
}

export async function runDone(options: DoneOptions, dependencies: DoneDependencies): Promise<string> {
  const title = Array.from(options.title.trim()).slice(0, 80).join("")
  if (!title) throw invalidTitle()
  const now = dependencies.now ?? Date.now()
  const resolved = await dependencies.resolveDirName(dependencies.cwd)
  const events = (dependencies.readEvents ?? readEventsDefault)(dependencies.home, { now })
  const recent = events
    .filter((event) => event.dir !== undefined && dirNameKey(event.dir) === dirNameKey(resolved.dir) && event.session.length > 0)
    .sort((left, right) => right.t - left.t)[0]
  const environmentSession = dependencies.env.CLAUDE_CODE_SESSION_ID
  const session = options.session || environmentSession || recent?.session || `manual-${new Date(now).toISOString().slice(0, 10)}`
  const agent: Agent = options.agent ?? (environmentSession ? "claude-code" : recent?.agent ?? "codex")
  const event: DoneEvent = {
    v: 1,
    t: now,
    agent,
    session,
    dir: resolved.dir,
    cwd: dependencies.cwd,
    kind: "done",
    title,
  }
  ;(dependencies.appendEvent ?? appendEventDefault)(dependencies.home, event)
  if (loadCredentials(dependencies.home, dependencies.env)) dependencies.spawnBackgroundSync()
  return `已记下：${title}`
}
