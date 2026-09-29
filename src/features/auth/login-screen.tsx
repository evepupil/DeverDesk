"use client"

import { useState, type FormEvent } from "react"

import { WorkbenchMark } from "@/components/base/marks"
import { Field } from "@/components/base/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/react"
import { ApiFailure, login } from "@/lib/api"

/** 登录尝试太多时，秒数向上取整成分钟 */
function minutesOf(retryAfter: number | undefined): number {
  return Math.max(1, Math.ceil((retryAfter ?? 60) / 60))
}

/** 在线版没登录时的整屏登录页 */
export function LoginScreen({
  passwordEnabled,
  onSuccess,
}: {
  passwordEnabled: boolean
  onSuccess: () => void
}) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const t = useT()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    // 只用去掉空格的结果判断有没有填；提交原样的输入，口令本身可能带首尾空格
    if (!password.trim()) {
      setError(t.auth.login.empty)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await login(password)
      onSuccess()
    } catch (cause) {
      const failure = cause instanceof ApiFailure ? cause : null
      if (failure?.kind === "unauthorized") {
        // 口令不对：不显示服务器返回的原文，按状态码换成当前语言的话
        setError(t.auth.login.wrongPassword)
      } else if (failure?.kind === "rate-limited") {
        setError(t.auth.login.rateLimited(minutesOf(failure.retryAfter)))
      } else if (failure?.kind === "network") {
        setError(t.auth.login.network)
      } else {
        setError(t.auth.login.failed)
      }
      setSubmitting(false)
    }
  }

  return (
    <main className="flex h-dvh items-center justify-center bg-window px-4">
      <div className="w-[340px] rounded-lg border border-line-2 bg-card p-6 shadow-md">
        <div className="mb-5 flex items-center justify-center gap-2">
          <WorkbenchMark size={20} />
          <span className="font-heading text-sm font-medium">DeverDesk</span>
        </div>
        {passwordEnabled ? (
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <Field id="login-password" label={t.auth.login.passwordLabel} error={error ?? undefined}>
              <Input
                id="login-password"
                type="password"
                value={password}
                autoFocus
                autoComplete="current-password"
                disabled={submitting}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-password-error" : undefined}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError(null)
                }}
              />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? t.auth.login.submitting : t.auth.login.submit}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-fg-2">{t.auth.login.noPassword}</p>
        )}
      </div>
    </main>
  )
}
