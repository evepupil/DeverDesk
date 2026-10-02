import {
  API_PATHS,
  type AuthorizeDecision,
  type AuthorizeDecisionRequest,
  type AuthorizeResponse,
  type TokenTier,
} from "@/sync/protocol"
import { request } from "./api"

/** 授权页：检查 AI 应用带来的授权请求。query 是地址栏 ? 后面的原样内容 */
export function describeAuthorization(query: string): Promise<AuthorizeResponse> {
  return request<AuthorizeResponse>(`${API_PATHS.oauthAuthorize}?${query}`)
}

/** 授权页：允许或拒绝，服务器整份再检查一遍，返回要跳去的地址 */
export function decideAuthorization(query: string, decision: AuthorizeDecision, tier: TokenTier): Promise<AuthorizeResponse> {
  const body: AuthorizeDecisionRequest = { query, decision, tier }
  return request<AuthorizeResponse>(API_PATHS.oauthAuthorize, { method: "POST", body: JSON.stringify(body) })
}
