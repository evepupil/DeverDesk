import { LIVE_EXPIRE_MS, type LiveRequest, type LiveResponse, type LiveWindow } from "../../src/sync/recorder-protocol"
import { findProjectByDir } from "../../src/domain/dir-names"
import type { Project } from "../../src/domain/types"
import { createD1DataSource } from "../mcp/data/d1"
import { validateLiveRequest } from "./validate"

const LIVE_SETTING = "recorder_live"

interface StoredLive {
  windows: LiveWindow[]
  updatedAt: number
}

function emptyLive(): StoredLive {
  return { windows: [], updatedAt: 0 }
}

function parseLive(value: string | null): StoredLive {
  if (value === null) return emptyLive()
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return emptyLive()
    const stored = parsed as Record<string, unknown>
    if (typeof stored.updatedAt !== "number" || !Number.isFinite(stored.updatedAt)) return emptyLive()
    const updatedAt = stored.updatedAt
    const validated = validateLiveRequest({ windows: stored.windows }, updatedAt)
    if (!validated.ok) return emptyLive()
    return { windows: validated.value.windows, updatedAt }
  } catch {
    return emptyLive()
  }
}

async function readLive(db: D1Database): Promise<StoredLive> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
    .bind(LIVE_SETTING).first<{ value: string }>()
  return parseLive(row?.value ?? null)
}

function attachBindings(windows: readonly LiveWindow[], projects: readonly Project[]): LiveResponse["windows"] {
  const result: LiveResponse["windows"] = []
  for (const window of windows) {
    const project = findProjectByDir(projects, window.dir)
    if (!project) continue
    result.push({ ...window, projectId: project.id, projectName: project.name })
  }
  return result
}

export async function getRecorderLive(db: D1Database, now: number): Promise<LiveResponse> {
  const stored = await readLive(db)
  if (now - stored.updatedAt > LIVE_EXPIRE_MS) return { windows: [], updatedAt: stored.updatedAt }
  const projects = await createD1DataSource(db).projects()
  return { windows: attachBindings(stored.windows, projects.map(({ value }) => value)), updatedAt: stored.updatedAt }
}

export async function putRecorderLive(
  db: D1Database,
  projects: readonly Project[],
  request: LiveRequest,
  now: number,
): Promise<void> {
  const windows = attachBindings(request.windows, projects).map((window) => ({
    session: window.session,
    dir: window.dir,
    agent: window.agent,
    since: window.since,
    minutes: window.minutes,
  }))
  const stored: StoredLive = { windows, updatedAt: now }
  await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(LIVE_SETTING, JSON.stringify(stored)).run()
}

