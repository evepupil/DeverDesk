// 个人令牌的 D1 列表、新建、改权限、撤销，以及按摘要查令牌身份。
import { DEFAULT_TOKEN_TIER, type CreatedToken, type TokenInfo, type TokenTier } from "../../src/sync/protocol"
import { randomBase64Url, sha256Hex } from "../auth/crypto"
import type { TokenIdentity } from "../types"

interface TokenRow {
  id: string
  name: string
  tier: TokenTier
  created_at: number
  last_used_at: number | null
}

function toTokenInfo(row: TokenRow): TokenInfo {
  return { id: row.id, name: row.name, tier: row.tier, createdAt: row.created_at, lastUsedAt: row.last_used_at, kind: "token" }
}

export async function listTokens(db: D1Database): Promise<TokenInfo[]> {
  const result = await db.prepare(
    "SELECT id, name, tier, created_at, last_used_at FROM tokens ORDER BY created_at DESC, id ASC"
  ).all<TokenRow>()
  return result.results.map(toTokenInfo)
}

export async function createToken(
  db: D1Database,
  name: string,
  tier: TokenTier = DEFAULT_TOKEN_TIER,
  now = Date.now()
): Promise<CreatedToken> {
  const token = `dd_${randomBase64Url(32)}`
  const id = randomBase64Url(18)
  const hash = await sha256Hex(token)
  await db.prepare("INSERT INTO tokens (id, name, hash, tier, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, NULL)")
    .bind(id, name, hash, tier, now)
    .run()
  return { id, name, tier, createdAt: now, lastUsedAt: null, kind: "token", token }
}

/** 改令牌的权限档；令牌不存在返回 false */
export async function updateTokenTier(db: D1Database, id: string, tier: TokenTier): Promise<boolean> {
  const result = await db.prepare("UPDATE tokens SET tier = ? WHERE id = ?").bind(tier, id).run()
  return (result.meta.changes ?? 0) > 0
}

export async function revokeToken(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM tokens WHERE id = ?").bind(id).run()
}

/**
 * 按令牌明文查身份（库里只存摘要），顺带每分钟最多更新一次「最近使用时间」。
 * 令牌格式不对或查不到返回 null。
 */
export async function findTokenIdentity(db: D1Database, bearer: string, now = Date.now()): Promise<TokenIdentity | null> {
  if (!/^dd_[A-Za-z0-9_-]{43}$/.test(bearer)) return null
  const hash = await sha256Hex(bearer)
  const row = await db.prepare("SELECT id, name, tier, last_used_at FROM tokens WHERE hash = ? LIMIT 1")
    .bind(hash)
    .first<{ id: string; name: string; tier: TokenTier; last_used_at: number | null }>()
  if (!row) return null
  if (row.last_used_at === null || row.last_used_at <= now - 60_000) {
    await db.prepare("UPDATE tokens SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= ?)")
      .bind(now, row.id, now - 60_000)
      .run()
  }
  return { id: row.id, name: row.name, tier: row.tier }
}
