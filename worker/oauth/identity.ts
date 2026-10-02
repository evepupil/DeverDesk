// /mcp 用：授权来的通行令牌 → 连接身份（编号、名字、权限档），和个人令牌同一个形状。
import { sha256Hex } from "../auth/crypto"
import type { TokenIdentity } from "../types"
import { PREFIX, SECRET_PATTERN } from "./config"
import { findAccessToken, touchGrant } from "./store/grants"

export function isOAuthAccessToken(value: string): boolean {
  return value.startsWith(PREFIX.access) && SECRET_PATTERN.test(value.slice(PREFIX.access.length))
}

/** 令牌要没过期、发给的资源就是这个 /mcp；连接的最近使用时间每分钟最多更新一次 */
export async function findOAuthIdentity(
  db: D1Database,
  bearer: string,
  resource: string,
  now: number,
): Promise<TokenIdentity | null> {
  if (!isOAuthAccessToken(bearer)) return null
  const found = await findAccessToken(db, await sha256Hex(bearer))
  if (!found || found.expiresAt <= now || found.resource !== resource) return null
  if (found.lastUsedAt === null || found.lastUsedAt <= now - 60_000) await touchGrant(db, found.grantId, now)
  return { id: found.grantId, name: found.clientName, tier: found.tier }
}
