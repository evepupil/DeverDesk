// Worker 绑定和运行上下文的本地类型。
import type { AuthMethod, TokenTier } from "../src/sync/protocol"

export type WorkerEnv = Omit<Env, "DEVERDESK_PASSWORD"> & {
  DEVERDESK_PASSWORD?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  /** 只在开发时设：页面和接口不在一个端口时，OAuth 说明书里的地址指向页面那一侧 */
  PUBLIC_ORIGIN?: string
}

export type WorkerContext = ExecutionContext

/** 访问令牌是谁、有什么权限 */
export interface TokenIdentity {
  id: string
  name: string
  tier: TokenTier
}

export interface AuthContext {
  via: AuthMethod
  /** 用访问令牌登录时才有 */
  token?: TokenIdentity
}
