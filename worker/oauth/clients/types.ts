// 认出来的客户端长什么样，换令牌、授权、注销共用。
import type { AuthorizeInvalidReason } from "../../../src/sync/protocol"

/** 客户端在换令牌时怎么证明自己：公开客户端不带密钥，靠 PKCE */
export type ClientAuthMethod = "none" | "client_secret_basic" | "client_secret_post"

export const CLIENT_AUTH_METHODS: readonly ClientAuthMethod[] = ["none", "client_secret_basic", "client_secret_post"]

export interface ResolvedClient {
  id: string
  /** 对方自报的名字，授权页和连接列表上显示 */
  name: string
  redirectUris: string[]
  /** metadata：读身份说明认的；known：读不到时按内置名单认的；registered：自助登记的 */
  source: "metadata" | "known" | "registered"
}

/** 认不出来时的原因，授权页按它显示对应语言的话 */
export type ClientLookupFailure = Exclude<AuthorizeInvalidReason, "redirect_uri">

/** 授权、换令牌要用的时间和读外部网址的函数，测试里换成固定的 */
export interface OAuthDependencies {
  now(): number
  fetch: Fetcher
}

export const productionOAuthDependencies: OAuthDependencies = {
  now: () => Date.now(),
  fetch: (input, init) => fetch(input, init),
}

export type ClientLookup = { ok: true; client: ResolvedClient } | { ok: false; reason: ClientLookupFailure }

/** 读外部网址的函数，测试里换成假的 */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>
