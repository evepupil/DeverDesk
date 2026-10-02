// 跳回地址的两条规则：合不合格、能不能对上登记的地址。纯函数。

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])
export const MAX_REDIRECT_URI_LENGTH = 512

function parse(value: string): URL | null {
  if (value.length === 0 || value.length > MAX_REDIRECT_URI_LENGTH || value.includes("#")) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isLoopbackUrl(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)
}

/**
 * 合格：https 的任意地址，或主机是本机的 http 地址；不带 #、不带账号密码、最长 512 字。
 * javascript:、data:、自定义协议这些一律不收。
 */
export function isAcceptableRedirectUri(value: string): boolean {
  const url = parse(value)
  if (!url || url.username !== "" || url.password !== "") return false
  if (url.protocol === "https:") return url.hostname !== ""
  return isLoopbackUrl(url)
}

/** 跳回本机的地址（授权页上要多一句提醒） */
export function isLoopbackRedirectUri(value: string): boolean {
  const url = parse(value)
  return url !== null && isLoopbackUrl(url)
}

/**
 * 请求里的跳回地址能不能对上登记的某一个：逐字相同；
 * 或者两边都是本机 http 地址、主机路径查询串相同，端口可以不同（本机程序每次可能换端口）。
 */
export function matchesRegisteredRedirectUri(requested: string, registered: readonly string[]): boolean {
  if (!isAcceptableRedirectUri(requested)) return false
  if (registered.includes(requested)) return true
  const asked = parse(requested)
  if (!asked || !isLoopbackUrl(asked)) return false
  return registered.some((candidate) => {
    const known = parse(candidate)
    return known !== null
      && isLoopbackUrl(known)
      && known.hostname === asked.hostname
      && known.pathname === asked.pathname
      && known.search === asked.search
  })
}

/** 授权页上显示的网站：域名（非默认端口时带端口） */
export function redirectUriHost(value: string): string {
  return parse(value)?.host ?? ""
}

/** 在跳回地址后面接上参数；跳回地址不带 #，直接接在最后 */
export function appendQuery(redirectUri: string, params: Record<string, string | null>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) query.set(key, value)
  }
  return `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}${query.toString()}`
}
