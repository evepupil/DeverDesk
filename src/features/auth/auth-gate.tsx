"use client"

import { TriangleAlert } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"
import { ShellSkeleton } from "@/features/shell/shell-skeleton"
import { useT } from "@/i18n/react"
import { ApiFailure, getSession } from "@/lib/api"
import { IS_LOCAL_EDITION } from "@/lib/edition"
import { startSync, useSync } from "@/state/sync"
import { LoginScreen } from "./login-screen"

type Gate = "loading" | "ready" | "login" | "server-error"

/** 本地版不设门；在线版先确认登录，再进工作台 */
export function AuthGate({ children }: { children: ReactNode }) {
  if (IS_LOCAL_EDITION) return <>{children}</>
  return <CloudGate>{children}</CloudGate>
}

function CloudGate({ children }: { children: ReactNode }) {
  const t = useT()
  const [gate, setGate] = useState<Gate>("loading")
  const [passwordEnabled, setPasswordEnabled] = useState(true)

  // 查一次登录状态；连不上网就先用这台设备上的缓存，服务器出错才拦在门外
  const loadSession = () => {
    void getSession()
      .then((session) => {
        setPasswordEnabled(session.passwordEnabled)
        if (session.authenticated) {
          startSync()
          setGate("ready")
        } else {
          setGate("login")
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiFailure && cause.kind === "network") {
          startSync()
          setGate("ready")
          return
        }
        setGate("server-error")
      })
  }

  useEffect(() => {
    loadSession()
  }, [])

  // 重试：回到加载骨架再查一次
  const retry = () => {
    setGate("loading")
    loadSession()
  }

  // 登录成功：开始同步，进工作台
  const onLoggedIn = () => {
    startSync()
    setGate("ready")
  }

  // 登录过期（同步时被 401）：切回登录页
  useEffect(
    () =>
      useSync.subscribe((state) => {
        if (state.status === "unauthorized") setGate((current) => (current === "ready" ? "login" : current))
      }),
    []
  )

  if (gate === "loading") return <ShellSkeleton />
  if (gate === "login") return <LoginScreen passwordEnabled={passwordEnabled} onSuccess={onLoggedIn} />
  if (gate === "server-error") {
    return (
      <main className="flex h-dvh items-center justify-center bg-window">
        <EmptyState
          icon={TriangleAlert}
          tone="error"
          title={t.auth.gate.offline}
          action={
            <Button variant="outline" size="sm" onClick={retry}>
              {t.words.retry}
            </Button>
          }
        />
      </main>
    )
  }
  return <>{children}</>
}
