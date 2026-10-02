// 授权码：只存摘要；换过令牌后记下建出的连接，留到过期，用来发现重复使用。
import type { TokenTier } from "../../../src/sync/protocol"

export interface CodeRecord {
  hash: string
  clientId: string
  clientName: string
  clientHost: string
  redirectUri: string
  codeChallenge: string
  resource: string
  scope: string
  tier: TokenTier
  expiresAt: number
  /** 用过才有：换出来的连接编号 */
  grantId: string | null
}

interface CodeRow {
  hash: string
  client_id: string
  client_name: string
  client_host: string
  redirect_uri: string
  code_challenge: string
  resource: string
  scope: string
  tier: TokenTier
  expires_at: number
  grant_id: string | null
}

export async function insertCode(db: D1Database, code: Omit<CodeRecord, "grantId">): Promise<void> {
  await db.prepare(
    "INSERT INTO oauth_codes (hash, client_id, client_name, client_host, redirect_uri, code_challenge, resource, scope, tier, expires_at, grant_id) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
  ).bind(
    code.hash, code.clientId, code.clientName, code.clientHost, code.redirectUri,
    code.codeChallenge, code.resource, code.scope, code.tier, code.expiresAt,
  ).run()
}

export async function findCode(db: D1Database, hash: string): Promise<CodeRecord | null> {
  const row = await db.prepare(
    "SELECT hash, client_id, client_name, client_host, redirect_uri, code_challenge, resource, scope, tier, expires_at, grant_id " +
    "FROM oauth_codes WHERE hash = ? LIMIT 1",
  ).bind(hash).first<CodeRow>()
  if (!row) return null
  return {
    hash: row.hash,
    clientId: row.client_id,
    clientName: row.client_name,
    clientHost: row.client_host,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    resource: row.resource,
    scope: row.scope,
    tier: row.tier,
    expiresAt: row.expires_at,
    grantId: row.grant_id,
  }
}
