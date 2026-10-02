// 授权范围和资源地址的规则。纯函数。
import { MCP_SCOPE, OFFLINE_SCOPE } from "../config"

/**
 * 授予的范围：只认 mcp 和 offline_access，不认识的忽略；
 * 总是给 mcp，请求里带了 offline_access 就再加上它（Claude 看到说明书里有就会带上）。
 */
export function grantedScope(requested: string | null): string {
  const asked = new Set((requested ?? "").split(" ").filter(Boolean))
  return asked.has(OFFLINE_SCOPE) ? `${MCP_SCOPE} ${OFFLINE_SCOPE}` : MCP_SCOPE
}

/** 续期时要求的范围不能超出原来的 */
export function isScopeWithin(requested: string, granted: string): boolean {
  const allowed = new Set(granted.split(" ").filter(Boolean))
  return requested.split(" ").filter(Boolean).every((scope) => allowed.has(scope))
}

/**
 * 资源地址统一写法：主机小写、去掉结尾斜杠、不带查询串和 #。
 * 不是 http(s) 地址返回 null。
 */
export function canonicalResource(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.search !== "" || url.hash !== "" || value.includes("#")) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
}

/** 请求里的 resource 是不是指向本站 /mcp；没带算是 */
export function isOwnResource(value: string | null, resource: string): boolean {
  if (value === null) return true
  return canonicalResource(value) === resource
}
