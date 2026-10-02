// 限速按「来源」计数：IPv4 按单个地址；IPv6 按前 64 位网段（同一台机器能随手换同一网段里的地址）。纯函数。

function expandIpv6(ip: string): string[] | null {
  const [head = "", tail = "", ...rest] = ip.split("::")
  if (rest.length > 0) return null
  const left = head ? head.split(":") : []
  const right = tail ? tail.split(":") : []
  if (!ip.includes("::")) return left.length === 8 ? left : null
  const missing = 8 - left.length - right.length
  if (missing < 1) return null
  return [...left, ...Array.from({ length: missing }, () => "0"), ...right]
}

export function rateLimitSource(ip: string): string {
  if (!ip.includes(":")) return ip
  // IPv4 映射成 IPv6 的写法（::ffff:1.2.3.4）按里面的 IPv4 地址算
  const mapped = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mapped) return mapped[1]!
  const groups = expandIpv6(ip.split("%")[0]!)
  if (!groups || groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return ip.toLowerCase()
  const prefix = groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, ""))
  return `${prefix.join(":")}::/64`
}
