// 去对方官网读身份说明：不跟随跳转、5 秒超时、只认 200、最多读 5 KB。
import { parseClientMetadata, type ClientMetadata } from "../rules/client-metadata"
import type { Fetcher } from "./types"

export const MAX_METADATA_BYTES = 5 * 1024
export const METADATA_TIMEOUT_MS = 5_000

async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  const length = response.headers.get("Content-Length")
  if (length !== null && Number(length) > maxBytes) return null
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    return null
  }
}

/** 读到并且内容能用返回客户端，否则 null（原因写日志，授权页只说「读不到」） */
export async function fetchClientMetadata(clientId: string, fetcher: Fetcher): Promise<ClientMetadata | null> {
  try {
    const response = await fetcher(clientId, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    })
    if (response.status !== 200) {
      console.warn("OAuth client metadata fetch failed", clientId, response.status)
      await response.body?.cancel()
      return null
    }
    const text = await readCapped(response, MAX_METADATA_BYTES)
    if (text === null) {
      console.warn("OAuth client metadata too large or not UTF-8", clientId)
      return null
    }
    const metadata = parseClientMetadata(clientId, JSON.parse(text))
    if (!metadata) console.warn("OAuth client metadata rejected", clientId)
    return metadata
  } catch (error) {
    console.warn("OAuth client metadata unavailable", clientId, error instanceof Error ? error.message : String(error))
    return null
  }
}
