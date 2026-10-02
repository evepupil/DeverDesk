// 身份说明（客户端编号是网址、内容挂在对方官网上的 JSON）的两条规则：编号合不合格、内容能不能用。纯函数。
import { isAcceptableRedirectUri } from "./redirect-uri"

export const MAX_CLIENT_ID_LENGTH = 512
export const MAX_CLIENT_NAME_LENGTH = 100
const MAX_REDIRECT_URIS = 20

/** 认出来的客户端：编号、给人看的名字、登记的跳回地址 */
export interface ClientMetadata {
  clientId: string
  name: string
  redirectUris: string[]
}

function isIpLiteral(hostname: string): boolean {
  return hostname.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
}

/**
 * 编号是不是合格的身份说明网址：https、有路径、不带账号密码和 #；
 * 必须是标准写法（和浏览器整理后的写法逐字相同，顺带挡掉 . 和 .. 段、大写域名、多余端口）；
 * 主机不能是 IP、localhost 或没有点的内网名字。
 */
export function isClientMetadataUrl(value: string): boolean {
  if (value.length > MAX_CLIENT_ID_LENGTH || !value.startsWith("https://") || value.includes("#")) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.href !== value || url.username !== "" || url.password !== "") return false
  if (url.pathname === "/" || url.pathname === "") return false
  const host = url.hostname
  return host.includes(".") && !isIpLiteral(host) && host !== "localhost" && !host.endsWith(".localhost")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 控制字符、格式字符（从右往左排、零宽字符等）、行和段落分隔符：会把标题和列表搅乱 */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

/** 名字是对方自报的：去掉看不见的字符和首尾空白，太长截断，没有就用域名 */
export function displayName(value: unknown, fallbackHost: string): string {
  if (typeof value !== "string") return fallbackHost
  const cleaned = value.replace(INVISIBLE, "").trim()
  if (cleaned === "") return fallbackHost
  return [...cleaned].slice(0, MAX_CLIENT_NAME_LENGTH).join("")
}

/** 只接受公开客户端：声明 none，或者列出的支持方式里有 none（ChatGPT 声明 private_key_jwt、同时支持 none） */
function supportsPublicClient(document: Record<string, unknown>): boolean {
  const declared = document.token_endpoint_auth_method
  if (declared === undefined || declared === "none") return true
  const supported = document.token_endpoint_auth_methods_supported
  return Array.isArray(supported) && supported.includes("none")
}

/**
 * 检查读回来的身份说明：client_id 和网址逐字相同、跳回地址 1–20 个且都合格、
 * 不带密钥、能当公开客户端用。能用返回认出来的客户端，否则 null。
 */
export function parseClientMetadata(clientId: string, document: unknown): ClientMetadata | null {
  if (!isRecord(document) || document.client_id !== clientId) return null
  if ("client_secret" in document || "client_secret_expires_at" in document) return null
  if (!supportsPublicClient(document)) return null
  const uris = document.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) return null
  if (!uris.every((uri): uri is string => typeof uri === "string" && isAcceptableRedirectUri(uri))) return null
  return {
    clientId,
    name: displayName(document.client_name, new URL(clientId).hostname),
    redirectUris: [...uris],
  }
}
