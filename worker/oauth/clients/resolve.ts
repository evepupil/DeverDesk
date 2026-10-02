// 按客户端编号认客户端：网址 → 读身份说明，读不到查内置名单；ddcl_ 开头 → 查自助登记表。
import { PREFIX } from "../config"
import { isClientMetadataUrl, MAX_CLIENT_ID_LENGTH } from "../rules/client-metadata"
import { findRegisteredClient } from "../store/clients"
import { fetchClientMetadata } from "./fetch-metadata"
import { knownClient } from "./known-clients"
import type { ClientLookup, Fetcher } from "./types"

export async function resolveClient(db: D1Database, clientId: string, fetcher: Fetcher): Promise<ClientLookup> {
  if (clientId.length === 0 || clientId.length > MAX_CLIENT_ID_LENGTH) return { ok: false, reason: "client_id" }

  if (clientId.startsWith("https://")) {
    if (!isClientMetadataUrl(clientId)) return { ok: false, reason: "client_id" }
    const fetched = await fetchClientMetadata(clientId, fetcher)
    if (fetched) return { ok: true, client: { id: clientId, name: fetched.name, redirectUris: fetched.redirectUris, source: "metadata" } }
    const known = knownClient(clientId)
    if (known) return { ok: true, client: { id: clientId, name: known.name, redirectUris: [...known.redirectUris], source: "known" } }
    return { ok: false, reason: "metadata_unavailable" }
  }

  if (clientId.startsWith(PREFIX.client)) {
    const registered = await findRegisteredClient(db, clientId)
    if (!registered) return { ok: false, reason: "unknown_client" }
    return { ok: true, client: { id: registered.id, name: registered.name, redirectUris: registered.redirectUris, source: "registered" } }
  }

  return { ok: false, reason: "client_id" }
}
