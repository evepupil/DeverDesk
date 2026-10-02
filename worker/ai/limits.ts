// 改动提交限速与每小时一次的历史清理。
import { randomBase64Url } from "../auth/crypto"
import { ChangesetError } from "../mcp/types"

const CLEANUP_KEY = "ai_cleanup_at"
const CLEANUP_INTERVAL = 60 * 60 * 1000
const RETENTION = 30 * 24 * 60 * 60 * 1000
const PREVIEW_TTL = 15 * 60 * 1000
const RATE_WINDOW = 10 * 60 * 1000
const RATE_LIMIT = 200

interface RateRow {
  created_at: number
  changes: number
}

function cleanupTimestamp(value: string | undefined): number | null {
  if (!value) return null
  const timestamp = Number(value.split(":", 1)[0])
  return Number.isSafeInteger(timestamp) ? timestamp : null
}

export async function cleanupChangesets(db: D1Database, now: number): Promise<void> {
  const setting = await db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
    .bind(CLEANUP_KEY).first<{ value: string }>()
  const lastRun = cleanupTimestamp(setting?.value)
  if (lastRun !== null && now - lastRun < CLEANUP_INTERVAL) return

  const marker = `${now}:${randomBase64Url(8)}`
  const transitionId = randomBase64Url(12)
  const statements: D1PreparedStatement[] = []
  if (setting) {
    statements.push(db.prepare("UPDATE settings SET value = ? WHERE key = ? AND value = ?")
      .bind(marker, CLEANUP_KEY, setting.value))
  } else {
    statements.push(db.prepare("INSERT INTO settings (key, value) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)")
      .bind(CLEANUP_KEY, marker, CLEANUP_KEY))
  }
  statements.push(db.prepare(
    "UPDATE ai_changesets SET status = 'expired', decided_at = ?, decision_id = ? " +
    "WHERE status = 'preview' AND created_at < ? AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)"
  ).bind(now, transitionId, now - PREVIEW_TTL, CLEANUP_KEY, marker))
  statements.push(db.prepare(
    "DELETE FROM ai_changes WHERE changeset_id IN (SELECT id FROM ai_changesets WHERE created_at < ?) " +
    "AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)"
  ).bind(now - RETENTION, CLEANUP_KEY, marker))
  statements.push(db.prepare(
    "DELETE FROM ai_changesets WHERE created_at < ? AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)"
  ).bind(now - RETENTION, CLEANUP_KEY, marker))
  const result = await db.batch(statements)
  if ((result[0]?.meta.changes ?? 0) === 0) return
  try {
    await db.prepare("PRAGMA optimize").run()
  } catch (error) {
    console.error("AI changeset optimize failed", error)
  }
}

export async function enforceSubmitRate(db: D1Database, tokenId: string, changeCount: number, now: number): Promise<void> {
  const rows = await db.prepare(
    "SELECT c.created_at, COUNT(ch.seq) AS changes FROM ai_changesets c " +
    "JOIN ai_changes ch ON ch.changeset_id = c.id WHERE c.token_id = ? AND c.created_at > ? AND c.tool <> 'recorder' " +
    "GROUP BY c.id ORDER BY c.created_at ASC, c.id ASC"
  ).bind(tokenId, now - RATE_WINDOW).all<RateRow>()
  const current = rows.results.reduce((sum, row) => sum + row.changes, 0)
  if (current + changeCount <= RATE_LIMIT) return

  let remaining = current
  let retryAfter = RATE_WINDOW / 1000
  for (const row of rows.results) {
    remaining -= row.changes
    if (remaining + changeCount <= RATE_LIMIT) {
      retryAfter = Math.max(1, Math.ceil((row.created_at + RATE_WINDOW - now) / 1000))
      break
    }
  }
  throw new ChangesetError("rate_limited", "Too many changes were submitted recently.", retryAfter)
}

export const CHANGESET_LIMITS = {
  cleanupInterval: CLEANUP_INTERVAL,
  retention: RETENTION,
  previewTtl: PREVIEW_TTL,
  rateWindow: RATE_WINDOW,
  rateLimit: RATE_LIMIT,
} as const
