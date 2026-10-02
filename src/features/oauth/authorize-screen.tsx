"use client"

import { TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"
import { LoginScreen } from "@/features/auth/login-screen"
import { useT } from "@/i18n/react"
import { ApiFailure, getSession } from "@/lib/api"
import { IS_LOCAL_EDITION } from "@/lib/edition"
import { decideAuthorization, describeAuthorization } from "@/lib/oauth-api"
import type {
  AuthorizeClientView,
  AuthorizeDecision,
  AuthorizeInvalidReason,
  AuthorizeResponse,
  TokenTier,
} from "@/sync/protocol"
import { AuthorizeFrame } from "./authorize-frame"
import { ConsentCard } from "./consent-card"

type Phase =
  | { kind: "loading" }
  | { kind: "login"; passwordEnabled: boolean }
  | { kind: "consent"; client: AuthorizeClientView }
  /** 请求在你点允许之前就有错：跳回地址虽然登记过，但不一定可信，不自动跳，由你点按钮回去 */
  | { kind: "request-error"; redirectTo: string; host: string }
  | { kind: "redirecting"; host: string }
  | { kind: "invalid"; reason: AuthorizeInvalidReason }
  | { kind: "local" }
  | { kind: "error" }

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * 授权页：AI 应用把浏览器带过来，地址里是它的授权请求。
 * 先查登录（没登录就地出口令框），再让服务器检查请求，最后由用户选权限、允许或拒绝，按服务器给的地址跳回去。
 * 规则见 docs/模块设计/OAuth授权.md「授权页」。
 */
export function AuthorizeScreen() {
  const t = useT()
  // 本地版没有服务器，不会有 AI 应用把人带到这里；万一来了直接说明
  const [phase, setPhase] = useState<Phase>(() => (IS_LOCAL_EDITION ? { kind: "local" } : { kind: "loading" }))
  const [pending, setPending] = useState<AuthorizeDecision | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 授权请求原样转给服务器，页面自己不解析
  const query = useRef("")

  const go = useCallback((redirectTo: string) => {
    setPhase({ kind: "redirecting", host: hostOf(redirectTo) })
    window.location.assign(redirectTo)
  }, [])

  /** decided：是用户点了允许或拒绝之后的结果，可以直接跳；检查请求时的出错跳转要用户自己点 */
  const apply = useCallback((response: AuthorizeResponse, decided: boolean) => {
    if (response.status === "ok") setPhase({ kind: "consent", client: response.client })
    else if (response.status === "invalid") setPhase({ kind: "invalid", reason: response.reason })
    else if (decided) go(response.redirectTo)
    else setPhase({ kind: "request-error", redirectTo: response.redirectTo, host: hostOf(response.redirectTo) })
  }, [go])

  // 查登录、让服务器检查授权请求；调用前由调用方把状态切回加载中
  const load = useCallback(() => {
    getSession()
      .then((session) => {
        if (!session.authenticated) {
          setPhase({ kind: "login", passwordEnabled: session.passwordEnabled })
          return
        }
        return describeAuthorization(query.current).then((response) => apply(response, false))
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiFailure && cause.kind === "unauthorized") {
          setPhase({ kind: "login", passwordEnabled: true })
          return
        }
        setPhase({ kind: "error" })
      })
  }, [apply])

  useEffect(() => {
    if (IS_LOCAL_EDITION) return
    query.current = window.location.search.replace(/^\?/, "")
    load()
  }, [load])

  const reload = () => {
    setPhase({ kind: "loading" })
    load()
  }

  const decide = async (decision: AuthorizeDecision, tier: TokenTier) => {
    setPending(decision)
    setError(null)
    try {
      apply(await decideAuthorization(query.current, decision, tier), true)
    } catch (cause) {
      if (cause instanceof ApiFailure && cause.kind === "unauthorized") {
        setPhase({ kind: "login", passwordEnabled: true })
      } else {
        setError(t.oauth.failed)
      }
    } finally {
      setPending(null)
    }
  }

  if (phase.kind === "login") {
    return <LoginScreen passwordEnabled={phase.passwordEnabled} onSuccess={reload} />
  }

  return (
    <AuthorizeFrame>
      {phase.kind === "loading" && (
        <div aria-busy="true" aria-label={t.words.loading} className="flex flex-col gap-2">
          <div className="h-5 w-3/4 animate-pulse rounded-md bg-column" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-column" />
        </div>
      )}
      {phase.kind === "consent" && (
        <ConsentCard client={phase.client} pending={pending} error={error} onDecide={(decision, tier) => void decide(decision, tier)} />
      )}
      {phase.kind === "redirecting" && (
        <p role="status" className="text-center text-sm text-fg-2 break-all">
          {t.oauth.redirecting(phase.host)}
        </p>
      )}
      {phase.kind === "request-error" && (
        <EmptyState
          icon={TriangleAlert}
          tone="error"
          title={t.oauth.requestError(phase.host)}
          className="py-2"
          action={
            <Button variant="outline" size="sm" onClick={() => go(phase.redirectTo)}>
              {t.oauth.backTo(phase.host)}
            </Button>
          }
        />
      )}
      {phase.kind === "invalid" && (
        <EmptyState icon={TriangleAlert} tone="error" title={t.oauth.invalid(t.oauth.reasons[phase.reason])} className="py-2" />
      )}
      {phase.kind === "local" && <EmptyState icon={TriangleAlert} title={t.oauth.localEdition} className="py-2" />}
      {phase.kind === "error" && (
        <EmptyState
          icon={TriangleAlert}
          tone="error"
          title={t.auth.gate.offline}
          className="py-2"
          action={
            <Button variant="outline" size="sm" onClick={reload}>
              {t.words.retry}
            </Button>
          }
        />
      )}
    </AuthorizeFrame>
  )
}
