// 给 AI 应用用的 OAuth 地址共用的响应和读取工具：OAuth 格式的错误、跨域头、限长读表单和 JSON。
// 这些地址不带 Cookie，允许任意来源跨域调用（浏览器里的调试工具也能用）。

export const MAX_OAUTH_BODY_BYTES = 16 * 1024

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
}

/** OAuth 规定的错误码 */
export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope"
  | "invalid_target"
  | "invalid_redirect_uri"
  | "invalid_client_metadata"
  | "temporarily_unavailable"
  | "too_many_requests"
  | "server_error"

export function oauthJson(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  for (const [name, value] of Object.entries(CORS_HEADERS)) responseHeaders.set(name, value)
  responseHeaders.set("Content-Type", "application/json; charset=utf-8")
  responseHeaders.set("Cache-Control", "no-store")
  responseHeaders.set("Pragma", "no-cache")
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

export function oauthError(error: OAuthErrorCode, description: string, status = 400, headers?: HeadersInit): Response {
  return oauthJson({ error, error_description: description }, status, headers)
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function methodNotAllowed(allow: string): Response {
  return new Response(null, { status: 405, headers: { ...CORS_HEADERS, Allow: allow } })
}

type BodyResult<T> = { ok: true; value: T } | { ok: false; response: Response }

async function readLimitedText(request: Request, maxBytes: number): Promise<BodyResult<string>> {
  const tooLarge = (): BodyResult<string> => ({
    ok: false,
    response: oauthError("invalid_request", `The request body must be at most ${maxBytes} bytes.`, 413),
  })
  const length = request.headers.get("Content-Length")
  if (length !== null && Number(length) > maxBytes) return tooLarge()
  if (!request.body) return { ok: true, value: "" }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        return tooLarge()
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, response: oauthError("invalid_request", "The request body could not be read.") }
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes) }
  } catch {
    return { ok: false, response: oauthError("invalid_request", "The request body must be UTF-8.") }
  }
}

function mediaType(request: Request): string {
  return (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase()
}

/** 换令牌和注销只收表单（RFC 6749） */
export async function readForm(request: Request): Promise<BodyResult<URLSearchParams>> {
  if (mediaType(request) !== "application/x-www-form-urlencoded") {
    return {
      ok: false,
      response: oauthError("invalid_request", "The request body must be application/x-www-form-urlencoded."),
    }
  }
  const text = await readLimitedText(request, MAX_OAUTH_BODY_BYTES)
  if (!text.ok) return text
  return { ok: true, value: new URLSearchParams(text.value) }
}

/** 自助登记收 JSON 对象（RFC 7591） */
export async function readJsonObject(request: Request): Promise<BodyResult<Record<string, unknown>>> {
  if (mediaType(request) !== "application/json") {
    return { ok: false, response: oauthError("invalid_client_metadata", "The request body must be application/json.") }
  }
  const text = await readLimitedText(request, MAX_OAUTH_BODY_BYTES)
  if (!text.ok) return text
  try {
    const value: unknown = JSON.parse(text.value)
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return { ok: true, value: value as Record<string, unknown> }
    }
  } catch {
    // 落到下面统一报错
  }
  return { ok: false, response: oauthError("invalid_client_metadata", "The request body must be a JSON object.") }
}

/**
 * 表单里某个参数只能出现一次（OAuth 规定重复的参数要当错误）。
 * 没有返回 null，重复返回 undefined。
 */
export function single(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name)
  if (values.length > 1) return undefined
  return values[0] ?? null
}
