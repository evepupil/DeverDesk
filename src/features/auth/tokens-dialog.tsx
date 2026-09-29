"use client"

import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ApiFailure, createToken, listTokens, revokeToken } from "@/lib/api"
import { copyText } from "@/lib/platform"
import type { CreatedToken, TokenInfo } from "@/sync/protocol"
import { syncNow } from "@/state/sync"
import { useUi } from "@/state/ui"

const NAME_MAX = 40

/** 登录过期：关掉弹窗，让同步去确认一次，登录门随后切回登录页 */
function sessionExpired(cause: unknown): boolean {
  if (!(cause instanceof ApiFailure) || cause.kind !== "unauthorized") return false
  useUi.getState().setTokensOpen(false)
  void syncNow()
  return true
}

/** 时间显示成「9月30日」 */
function formatDay(at: number): string {
  const date = new Date(at)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** 新建后的令牌：只显示这一次 */
function CreatedTokenRow({ created }: { created: CreatedToken }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (await copyText(created.token)) {
      setCopied(true)
      toast.success("已复制")
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <Input
          readOnly
          value={created.token}
          aria-label="新建的访问令牌"
          className="min-w-0 flex-1 font-mono"
          onFocus={(event) => event.target.select()}
        />
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="text-done" /> : <Copy />}
          复制
        </Button>
      </div>
      <p className="text-xs text-fg-2">只显示这一次，现在复制保存好</p>
    </div>
  )
}

/** 访问令牌：给以后的 AI 助手用 */
export function TokensDialog() {
  const open = useUi((state) => state.tokensOpen)
  const setOpen = useUi((state) => state.setTokensOpen)
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [created, setCreated] = useState<CreatedToken | null>(null)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<TokenInfo | null>(null)
  const [reload, setReload] = useState(0)

  // 弹窗开着就读一遍列表（打开、重试时重新读）
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void listTokens()
      .then((data) => {
        if (!cancelled) setTokens(data)
      })
      .catch((cause: unknown) => {
        if (!cancelled && !sessionExpired(cause)) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, reload])

  const load = useCallback(() => {
    setTokens(null)
    setLoadError(false)
    setReload((current) => current + 1)
  }, [])

  // 关掉就清空：新建的令牌不再显示，下次打开重新读
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setTokens(null)
      setLoadError(false)
      setCreated(null)
      setName("")
      setNameError(null)
      setRevoking(null)
    }
  }

  const submit = async () => {
    const value = name.trim()
    if (!value) {
      setNameError("请填写用途")
      return
    }
    if (value.length > NAME_MAX) {
      setNameError(`最多 ${NAME_MAX} 个字`)
      return
    }
    setCreating(true)
    setNameError(null)
    try {
      setCreated(await createToken(value))
      setName("")
      load()
    } catch (cause) {
      if (!sessionExpired(cause)) setNameError("没能新建，再试一次")
    } finally {
      setCreating(false)
    }
  }

  const revoke = async () => {
    if (!revoking) return
    try {
      await revokeToken(revoking.id)
      load()
    } catch (cause) {
      if (!sessionExpired(cause)) toast.error("没能撤销，再试一次")
    } finally {
      setRevoking(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="gap-0 p-0 sm:max-w-[440px]">
          <DialogHeader className="border-b border-line px-4 py-3">
            <DialogTitle>访问令牌</DialogTitle>
            <DialogDescription className="sr-only">给 AI 助手这类程序用的登录凭证</DialogDescription>
          </DialogHeader>
          <div className="px-4 py-4">
            {created && (
              <div className="mb-4">
                <CreatedTokenRow created={created} />
              </div>
            )}
            {loadError ? (
              <EmptyState
                icon={TriangleAlert}
                tone="error"
                title="没能读取令牌"
                action={
                  <Button variant="outline" size="sm" onClick={load}>
                    重试
                  </Button>
                }
              />
            ) : tokens === null ? (
              <div aria-busy="true" aria-label="正在加载" className="flex flex-col gap-2 py-2">
                <div className="h-9 animate-pulse rounded-md bg-column" />
                <div className="h-9 animate-pulse rounded-md bg-column" />
              </div>
            ) : tokens.length === 0 ? (
              !created && <p className="py-2 text-sm text-fg-2">还没有令牌</p>
            ) : (
              <ul className="flex flex-col">
                {tokens.map((token) => (
                  <li key={token.id} className="flex items-center gap-2 py-1.5">
                    <KeyRound className="size-4 shrink-0 text-fg-3" aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{token.name}</span>
                      <span className="text-xs text-fg-2">
                        {formatDay(token.createdAt)} 创建 ·{" "}
                        {token.lastUsedAt === null ? "没用过" : `${formatDay(token.lastUsedAt)} 用过`}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(token)}>
                      撤销
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
            className="border-t border-line px-4 py-3"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <Input
                  value={name}
                  maxLength={NAME_MAX}
                  placeholder="用途，比如 Claude"
                  aria-label="令牌用途"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? "token-name-error" : undefined}
                  onChange={(event) => setName(event.target.value)}
                />
                <Button type="submit" disabled={creating}>
                  新建
                </Button>
              </div>
              {nameError && (
                <p id="token-name-error" role="alert" className="text-xs text-bad">
                  {nameError}
                </p>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={revoking !== null} onOpenChange={(next) => !next && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤销「{revoking?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>撤销后，用这个令牌的程序会马上失效。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void revoke()}>
              撤销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
