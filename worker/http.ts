// JSON 响应和有 1 MB 上限的请求体读取工具。
export const MAX_REQUEST_BYTES = 1024 * 1024

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set("Content-Type", "application/json; charset=utf-8")
  responseHeaders.set("Cache-Control", "no-store")
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

export function apiError(message: string, status: number, retryAfter?: number): Response {
  return jsonResponse(retryAfter === undefined ? { error: message } : { error: message, retryAfter }, status)
}

export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers })
}

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; response: Response }

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const length = request.headers.get("Content-Length")
  if (length !== null && Number(length) > MAX_REQUEST_BYTES) {
    return { ok: false, response: apiError("请求体不能超过 1 MB", 413) }
  }
  if (!request.body) return { ok: false, response: apiError("请求体不是有效 JSON", 400) }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel()
        return { ok: false, response: apiError("请求体不能超过 1 MB", 413) }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, response: apiError("请求体读取失败", 400) }
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown }
  } catch {
    return { ok: false, response: apiError("请求体不是有效 JSON", 400) }
  }
}
