// 个人令牌的 D1 列表、新建和撤销操作。
import type { CreatedToken, TokenInfo } from "../../src/sync/protocol"
import { randomBase64Url, sha256Hex } from "../auth/crypto"

interface TokenRow {
  id: string
  name: string
  created_at: number
  last_used_at: number | null
}

function toTokenInfo(row: TokenRow): TokenInfo {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at }
}

export async function listTokens(db: D1Database): Promise<TokenInfo[]> {
  const result = await db.prepare(
    "SELECT id, name, created_at, last_used_at FROM tokens ORDER BY created_at DESC, id ASC"
  ).all<TokenRow>()
  return result.results.map(toTokenInfo)
}

export async function createToken(db: D1Database, name: string, now = Date.now()): Promise<CreatedToken> {
  const token = `dd_${randomBase64Url(32)}`
  const id = randomBase64Url(18)
  const hash = await sha256Hex(token)
  await db.prepare("INSERT INTO tokens (id, name, hash, created_at, last_used_at) VALUES (?, ?, ?, ?, NULL)")
    .bind(id, name, hash, now)
    .run()
  return { id, name, createdAt: now, lastUsedAt: null, token }
}

export async function revokeToken(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM tokens WHERE id = ?").bind(id).run()
}
