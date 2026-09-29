// Worker 绑定和运行上下文的本地类型。
import type { AuthMethod } from "../src/sync/protocol"

export type WorkerEnv = Omit<Env, "DEVERDESK_PASSWORD"> & {
  DEVERDESK_PASSWORD?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
}

export type WorkerContext = ExecutionContext

export interface AuthContext {
  via: AuthMethod
  tokenId?: string
}
