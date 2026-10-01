const LEGACY_PROTOCOL = "2025-06-18"
const CURRENT_PROTOCOL = "2026-07-28"
const CLIENT_INFO = { name: "DeverDesk acceptance", version: "1.0.0" }
const CLIENT_CAPABILITIES = {}
const PROTOCOL_META = {
  "io.modelcontextprotocol/protocolVersion": CURRENT_PROTOCOL,
  "io.modelcontextprotocol/clientCapabilities": CLIENT_CAPABILITIES,
  "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /^(authorization|cookie|password|token|set-cookie)$/i.test(key) ? "[redacted]" : sanitize(item),
  ]))
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseMcpBody(text, contentType) {
  if (!text) return null
  if (contentType.includes("text/event-stream")) {
    const data = text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart())
    return parseJson(data.join("\n"))
  }
  return parseJson(text)
}

export async function requestJson(base, path, { method = "GET", cookie, token, body } = {}) {
  const headers = { Accept: "application/json" }
  if (cookie) headers.Cookie = cookie
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"
  const serialized = body === undefined ? undefined : JSON.stringify(body)
  const response = await fetch(new URL(path, base), { method, headers, ...(serialized === undefined ? {} : { body: serialized }) })
  const text = await response.text()
  const data = parseJson(text)
  return {
    request: sanitize({ method, url: new URL(path, base).toString(), headers, body }),
    status: response.status,
    responseHeaders: {
      contentType: response.headers.get("content-type"),
      wwwAuthenticate: response.headers.get("www-authenticate"),
    },
    data,
    text,
  }
}

export async function createSession(base, password) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" }
  const response = await fetch(new URL("/api/session", base), {
    method: "POST",
    headers,
    body: JSON.stringify({ password }),
  })
  const text = await response.text()
  const data = parseJson(text)
  const setCookie = response.headers.get("set-cookie") ?? ""
  const cookie = setCookie.split(";")[0]
  return {
    cookie,
    exchange: {
      request: sanitize({ method: "POST", url: new URL("/api/session", base).toString(), headers, body: { password } }),
      status: response.status,
      responseHeaders: { contentType: response.headers.get("content-type") },
      data: sanitize(data),
      text,
    },
  }
}

export async function createToken(base, cookie, { name, tier }) {
  const exchange = await requestJson(base, "/api/tokens", {
    method: "POST",
    cookie,
    body: { name, tier },
  })
  const data = exchange.data && typeof exchange.data === "object" ? exchange.data : {}
  return {
    token: typeof data.token === "string" ? data.token : "",
    tier: data.tier,
    exchange: { ...exchange, data: sanitize(exchange.data) },
  }
}

export async function postMcp(base, {
  token,
  cookie,
  protocolVersion = LEGACY_PROTOCOL,
  method,
  params = {},
  id = 1,
  name,
  notification = false,
  modern = false,
}) {
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookie) headers.Cookie = cookie
  if (modern) {
    headers["MCP-Protocol-Version"] = protocolVersion
    headers["Mcp-Method"] = method
    if (name) headers["Mcp-Name"] = name
  } else if (method !== "initialize") {
    headers["MCP-Protocol-Version"] = protocolVersion
  }

  const requestParams = modern ? { ...params, _meta: PROTOCOL_META } : params
  const message = {
    jsonrpc: "2.0",
    ...(notification ? {} : { id }),
    method,
    ...(Object.keys(requestParams).length > 0 ? { params: requestParams } : {}),
  }
  const response = await fetch(new URL("/mcp", base), {
    method: "POST",
    headers,
    body: JSON.stringify(message),
  })
  const text = await response.text()
  const contentType = response.headers.get("content-type") ?? ""
  return {
    request: sanitize({ method: "POST", url: new URL("/mcp", base).toString(), headers, body: message }),
    status: response.status,
    responseHeaders: {
      contentType,
      wwwAuthenticate: response.headers.get("www-authenticate"),
    },
    data: parseMcpBody(text, contentType),
    text,
  }
}

export class McpClient {
  constructor(base, token, { protocolVersion = CURRENT_PROTOCOL, modern = true } = {}) {
    this.base = base
    this.token = token
    this.protocolVersion = protocolVersion
    this.modern = modern
    this.nextId = 0
  }

  request(method, params = {}, options = {}) {
    const id = options.notification ? undefined : ++this.nextId
    return postMcp(this.base, {
      token: this.token,
      protocolVersion: this.protocolVersion,
      method,
      params,
      id,
      name: options.name,
      notification: options.notification,
      modern: this.modern,
    })
  }

  initialize() {
    return this.request("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: CLIENT_CAPABILITIES,
      clientInfo: CLIENT_INFO,
    })
  }

  initialized() {
    return this.request("notifications/initialized", {}, { notification: true })
  }

  listTools() {
    return this.request("tools/list")
  }

  async callTool(name, args) {
    const exchange = await this.request("tools/call", { name, arguments: args }, { name })
    const result = exchange.data?.result ?? null
    const content = Array.isArray(result?.content) ? result.content : []
    return {
      exchange,
      result,
      structuredContent: result?.structuredContent ?? null,
      isError: result?.isError === true,
      text: content.filter((item) => item.type === "text").map((item) => item.text).join("\n"),
    }
  }
}

export function formatExchange(exchange) {
  if (!exchange) return "(没有可用的请求/响应记录)"
  let body = exchange.data === null || exchange.data === undefined ? exchange.text : exchange.data
  if (exchange.request?.body?.method === "tools/list" && Array.isArray(exchange.data?.result?.tools)) {
    const tools = exchange.data.result.tools.map(({ name, annotations }) => ({ name, annotations }))
    body = { result: { toolCount: tools.length, tools } }
  }
  return JSON.stringify(sanitize({
    request: exchange.request,
    response: {
      status: exchange.status,
      headers: exchange.responseHeaders,
      body,
    },
  }), null, 2)
}

export function isSuccessToolCall(call) {
  return Boolean(call?.exchange?.status === 200 && call.result && !call.isError && !call.exchange.data?.error)
}

export const MCP_PROTOCOLS = { LEGACY_PROTOCOL, CURRENT_PROTOCOL }
