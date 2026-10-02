// 连接和通行令牌：授权码换连接、续期轮换、按令牌找连接、列表、改权限、断开。
import type { TokenTier } from "../../../src/sync/protocol"

export interface GrantRecord {
  id: string
  clientId: string
  clientName: string
  clientHost: string
  tier: TokenTier
  resource: string
  scope: string
  refreshHash: string
  previousRefreshHash: string | null
  /** 上一张续期令牌被换下的时间 */
  rotatedAt: number | null
  refreshExpiresAt: number
  createdAt: number
  lastUsedAt: number | null
}

interface GrantRow {
  id: string
  client_id: string
  client_name: string
  client_host: string
  tier: TokenTier
  resource: string
  scope: string
  refresh_hash: string
  previous_refresh_hash: string | null
  rotated_at: number | null
  refresh_expires_at: number
  created_at: number
  last_used_at: number | null
}

const GRANT_COLUMNS =
  "id, client_id, client_name, client_host, tier, resource, scope, refresh_hash, previous_refresh_hash, rotated_at, refresh_expires_at, created_at, last_used_at"

function toGrant(row: GrantRow): GrantRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientHost: row.client_host,
    tier: row.tier,
    resource: row.resource,
    scope: row.scope,
    refreshHash: row.refresh_hash,
    previousRefreshHash: row.previous_refresh_hash,
    rotatedAt: row.rotated_at,
    refreshExpiresAt: row.refresh_expires_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

export interface NewGrant {
  id: string
  clientId: string
  clientName: string
  clientHost: string
  tier: TokenTier
  resource: string
  scope: string
  refreshHash: string
  refreshExpiresAt: number
}

/**
 * 授权码换连接，放在一个批次里：先把授权码标成已用（只在还没用过时才改得动），
 * 再建连接、发第一张通行令牌——后两步都以「授权码确实是这次标的」为前提，被别人抢先用了就什么也不建。
 */
export async function exchangeCodeForGrant(
  db: D1Database,
  input: { codeHash: string; grant: NewGrant; accessHash: string; accessExpiresAt: number; now: number },
): Promise<boolean> {
  const { codeHash, grant, accessHash, accessExpiresAt, now } = input
  const [marked] = await db.batch([
    db.prepare("UPDATE oauth_codes SET grant_id = ? WHERE hash = ? AND grant_id IS NULL").bind(grant.id, codeHash),
    db.prepare(
      `INSERT INTO oauth_grants (${GRANT_COLUMNS}) SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL ` +
      "WHERE EXISTS (SELECT 1 FROM oauth_codes WHERE hash = ? AND grant_id = ?)",
    ).bind(
      grant.id, grant.clientId, grant.clientName, grant.clientHost, grant.tier, grant.resource, grant.scope,
      grant.refreshHash, grant.refreshExpiresAt, now, codeHash, grant.id,
    ),
    db.prepare(
      "INSERT INTO oauth_tokens (hash, grant_id, expires_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM oauth_grants WHERE id = ?)",
    ).bind(accessHash, grant.id, accessExpiresAt, grant.id),
  ])
  return (marked?.meta.changes ?? 0) === 1
}

/** 按续期令牌的摘要找连接：当前那张或上一张 */
export async function findGrantByRefreshHash(db: D1Database, hash: string): Promise<GrantRecord | null> {
  const row = await db.prepare(
    `SELECT ${GRANT_COLUMNS} FROM oauth_grants WHERE refresh_hash = ? OR previous_refresh_hash = ? LIMIT 1`,
  ).bind(hash, hash).first<GrantRow>()
  return row ? toGrant(row) : null
}

export async function findGrant(db: D1Database, id: string): Promise<GrantRecord | null> {
  const row = await db.prepare(`SELECT ${GRANT_COLUMNS} FROM oauth_grants WHERE id = ? LIMIT 1`).bind(id).first<GrantRow>()
  return row ? toGrant(row) : null
}

export interface Rotation {
  grantId: string
  presentedHash: string
  newRefreshHash: string
  refreshExpiresAt: number
  now: number
}

/** 用的是当前那张：上一张换成它、记下换下的时间，当前换成新的。只在没被别人改过时才改得动 */
export async function rotateFromCurrent(db: D1Database, rotation: Rotation): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE oauth_grants SET previous_refresh_hash = refresh_hash, rotated_at = ?, refresh_hash = ?, refresh_expires_at = ?, last_used_at = ? " +
    "WHERE id = ? AND refresh_hash = ?",
  ).bind(rotation.now, rotation.newRefreshHash, rotation.refreshExpiresAt, rotation.now, rotation.grantId, rotation.presentedHash).run()
  return (result.meta.changes ?? 0) === 1
}

/**
 * 用的是上一张（客户端没收到上次续期的结果，马上拿旧的重试）：当前换成新的，上一张和换下时间不动。
 * 只在上一张换下不早于 notBefore 时才改得动。
 */
export async function rotateFromPrevious(db: D1Database, rotation: Rotation, notBefore: number): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE oauth_grants SET refresh_hash = ?, refresh_expires_at = ?, last_used_at = ? " +
    "WHERE id = ? AND previous_refresh_hash = ? AND rotated_at >= ?",
  ).bind(rotation.newRefreshHash, rotation.refreshExpiresAt, rotation.now, rotation.grantId, rotation.presentedHash, notBefore).run()
  return (result.meta.changes ?? 0) === 1
}

/** 发一张通行令牌，顺手删掉这条连接已过期的 */
export async function addAccessToken(
  db: D1Database,
  grantId: string,
  hash: string,
  expiresAt: number,
  now: number,
): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO oauth_tokens (hash, grant_id, expires_at) VALUES (?, ?, ?)").bind(hash, grantId, expiresAt),
    db.prepare("DELETE FROM oauth_tokens WHERE grant_id = ? AND expires_at <= ?").bind(grantId, now),
  ])
}

export interface AccessTokenGrant {
  grantId: string
  clientId: string
  clientName: string
  tier: TokenTier
  resource: string
  expiresAt: number
  lastUsedAt: number | null
}

/** 按通行令牌的摘要找它所属的连接 */
export async function findAccessToken(db: D1Database, hash: string): Promise<AccessTokenGrant | null> {
  const row = await db.prepare(
    "SELECT t.grant_id, t.expires_at, g.client_id, g.client_name, g.tier, g.resource, g.last_used_at " +
    "FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id WHERE t.hash = ? LIMIT 1",
  ).bind(hash).first<{
    grant_id: string
    expires_at: number
    client_id: string
    client_name: string
    tier: TokenTier
    resource: string
    last_used_at: number | null
  }>()
  if (!row) return null
  return {
    grantId: row.grant_id,
    clientId: row.client_id,
    clientName: row.client_name,
    tier: row.tier,
    resource: row.resource,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
  }
}

/** 连接的最近使用时间每分钟最多更新一次 */
export async function touchGrant(db: D1Database, id: string, now: number): Promise<void> {
  await db.prepare(
    "UPDATE oauth_grants SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= ?)",
  ).bind(now, id, now - 60_000).run()
}

export async function deleteAccessToken(db: D1Database, hash: string): Promise<void> {
  await db.prepare("DELETE FROM oauth_tokens WHERE hash = ?").bind(hash).run()
}

/** 断开一条连接：连接和它的全部通行令牌一起删。删到了返回 true */
export async function deleteGrant(db: D1Database, id: string): Promise<boolean> {
  const [, removed] = await db.batch([
    db.prepare("DELETE FROM oauth_tokens WHERE grant_id = ?").bind(id),
    db.prepare("DELETE FROM oauth_grants WHERE id = ?").bind(id),
  ])
  return (removed?.meta.changes ?? 0) > 0
}

/** 「连接 AI」列表用：还没过期的连接，新的在前 */
export async function listActiveGrants(db: D1Database, now: number): Promise<GrantRecord[]> {
  const result = await db.prepare(
    `SELECT ${GRANT_COLUMNS} FROM oauth_grants WHERE refresh_expires_at > ? ORDER BY created_at DESC, id ASC`,
  ).bind(now).all<GrantRow>()
  return result.results.map(toGrant)
}

export async function updateGrantTier(db: D1Database, id: string, tier: TokenTier): Promise<boolean> {
  const result = await db.prepare("UPDATE oauth_grants SET tier = ? WHERE id = ?").bind(tier, id).run()
  return (result.meta.changes ?? 0) > 0
}
