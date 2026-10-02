// OAuth 授权的常量（有效期、前缀、范围、地址）和本站地址的取法。规则见 docs/模块设计/OAuth授权.md。
import type { WorkerEnv } from "../types"

/** 授权码 5 分钟内有效 */
export const CODE_TTL_MS = 5 * 60 * 1000
/** 通行令牌 1 小时 */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
/** 续期令牌连续 30 天不用就失效；每次续期往后顺延 */
export const REFRESH_IDLE_MS = 30 * 24 * 60 * 60 * 1000

/** 各种凭证的前缀：一眼能分清是哪一种，也让 /mcp 知道去哪张表查 */
export const PREFIX = {
  code: "ddc_",
  access: "ddo_",
  refresh: "ddr_",
  client: "ddcl_",
  secret: "ddcs_",
  grant: "og_",
} as const

/** 前缀后面跟 32 字节随机数的 base64url（43 个字符） */
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/

export const MCP_SCOPE = "mcp"
export const OFFLINE_SCOPE = "offline_access"

export const OAUTH_PATHS = {
  authorizePage: "/authorize",
  token: "/oauth/token",
  register: "/oauth/register",
  revoke: "/oauth/revoke",
  resourceMetadata: "/.well-known/oauth-protected-resource",
  authorizationServerMetadata: "/.well-known/oauth-authorization-server",
} as const

/** 资源说明书的「带路径」地址里插在后面的那段 */
export const MCP_RESOURCE_PATH = "/mcp"

/**
 * 本站地址（协议 + 域名 + 端口，结尾不带斜杠）。
 * 线上取请求的地址；开发时页面和接口不在一个端口，scripts/dev.mjs 用 PUBLIC_ORIGIN 指向页面那一侧。
 */
export function publicOrigin(request: Request, env: Pick<WorkerEnv, "PUBLIC_ORIGIN">): string {
  const configured = env.PUBLIC_ORIGIN?.trim()
  if (configured) return configured.replace(/\/+$/, "")
  return new URL(request.url).origin
}

/** MCP 资源地址：令牌发给它、/mcp 核对它 */
export function resourceOf(origin: string): string {
  return `${origin}${MCP_RESOURCE_PATH}`
}

/** 资源说明书地址（401 的 resource_metadata 指向这里） */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}${OAUTH_PATHS.resourceMetadata}${MCP_RESOURCE_PATH}`
}
