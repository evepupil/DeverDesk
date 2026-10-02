// 自助登记的客户端：存、查、用过时记一笔、清理没人用的。
import type { ClientAuthMethod } from "../clients/types"

interface ClientRow {
  id: string
  name: string
  redirect_uris: string
  auth_method: ClientAuthMethod
  secret_hash: string | null
}

export interface RegisteredClientRow {
  id: string
  name: string
  redirectUris: string[]
  authMethod: ClientAuthMethod
  secretHash: string | null
}

/** 超过一天还没授权过的、或超过 30 天没用且没有连接的，登记时顺手删掉 */
const UNUSED_NEW_CLIENT_MS = 24 * 60 * 60 * 1000
const IDLE_CLIENT_MS = 30 * 24 * 60 * 60 * 1000

function parseUris(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

export async function insertClient(
  db: D1Database,
  client: RegisteredClientRow,
  now: number,
): Promise<void> {
  await db.prepare(
    "INSERT INTO oauth_clients (id, name, redirect_uris, auth_method, secret_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
  ).bind(client.id, client.name, JSON.stringify(client.redirectUris), client.authMethod, client.secretHash, now).run()
}

export async function findRegisteredClient(db: D1Database, id: string): Promise<RegisteredClientRow | null> {
  const row = await db.prepare(
    "SELECT id, name, redirect_uris, auth_method, secret_hash FROM oauth_clients WHERE id = ? LIMIT 1",
  ).bind(id).first<ClientRow>()
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    redirectUris: parseUris(row.redirect_uris),
    authMethod: row.auth_method,
    secretHash: row.secret_hash,
  }
}

export async function touchRegisteredClient(db: D1Database, id: string, now: number): Promise<void> {
  await db.prepare("UPDATE oauth_clients SET last_used_at = ? WHERE id = ?").bind(now, id).run()
}

export async function countRegisteredClients(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS total FROM oauth_clients").first<{ total: number }>()
  return row?.total ?? 0
}

/** 删掉没人用的客户端；有连接的一律保留 */
export async function deleteUnusedClients(db: D1Database, now: number): Promise<void> {
  await db.prepare(
    "DELETE FROM oauth_clients WHERE NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = oauth_clients.id) " +
    "AND ((last_used_at IS NULL AND created_at < ?) OR (last_used_at IS NOT NULL AND last_used_at < ?))",
  ).bind(now - UNUSED_NEW_CLIENT_MS, now - IDLE_CLIENT_MS).run()
}
