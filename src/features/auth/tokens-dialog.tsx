"use client"

import { TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
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
import { useT } from "@/i18n/react"
import { ApiFailure, createToken, getSession, listTokens, revokeToken } from "@/lib/api"
import type { CreatedToken, TokenInfo, TokenTier } from "@/sync/protocol"
import { DEFAULT_TOKEN_TIER, TOKEN_TIERS } from "@/sync/protocol"
import { syncNow } from "@/state/sync"
import { useUi } from "@/state/ui"
import { ConnectorAddress } from "./connector-address"
import { CreatedTokenDetails } from "./created-token-details"
import { TokenRow } from "./token-row"

const NAME_MAX = 40

/** Login expiration closes the dialog and lets sync refresh the gate state. */
function sessionExpired(cause: unknown): boolean {
  if (!(cause instanceof ApiFailure) || cause.kind !== "unauthorized") return false
  useUi.getState().setTokensOpen(false)
  void syncNow()
  return true
}

/** Manage MCP credentials for AI clients. */
export function TokensDialog() {
  const open = useUi((state) => state.tokensOpen)
  const setOpen = useUi((state) => state.setTokensOpen)
  const t = useT()
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [created, setCreated] = useState<CreatedToken | null>(null)
  const [accessSession, setAccessSession] = useState(false)
  const [name, setName] = useState("")
  const [tier, setTier] = useState<TokenTier>(DEFAULT_TOKEN_TIER)
  const [nameError, setNameError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<TokenInfo | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getSession()
      .then((session) => {
        if (!cancelled) setAccessSession(session.authenticated && session.via === "access")
      })
      .catch((cause: unknown) => {
        if (!cancelled) sessionExpired(cause)
      })
    return () => {
      cancelled = true
    }
  }, [open])

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

  const close = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setTokens(null)
      setLoadError(false)
      setCreated(null)
      setAccessSession(false)
      setName("")
      setTier(DEFAULT_TOKEN_TIER)
      setNameError(null)
      setRevoking(null)
    }
  }

  const submit = async () => {
    const value = name.trim()
    if (!value) {
      setNameError(t.auth.tokens.form.required)
      return
    }
    if (value.length > NAME_MAX) {
      setNameError(t.auth.tokens.form.tooLong(NAME_MAX))
      return
    }
    setCreating(true)
    setNameError(null)
    try {
      setCreated(await createToken(value, tier))
      setName("")
      load()
    } catch (cause) {
      if (!sessionExpired(cause)) setNameError(t.auth.tokens.form.createFailed)
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
      if (!sessionExpired(cause)) toast.error(t.auth.tokens.form.revokeFailed)
    } finally {
      setRevoking(null)
    }
  }

  const tierOptions = TOKEN_TIERS.map((value) => ({ value, label: t.auth.tokens.tiers[value] }))
  // 断开授权连接和撤销个人令牌走同一个接口，确认的话分开说
  const disconnecting = revoking?.kind === "oauth"

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
          <DialogHeader className="border-b border-line px-4 py-3">
            <DialogTitle>{t.auth.tokens.title}</DialogTitle>
            <DialogDescription className="sr-only">{t.auth.tokens.description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <ConnectorAddress accessSession={accessSession} />
            {created && <CreatedTokenDetails created={created} accessSession={accessSession} />}
            {loadError ? (
              <EmptyState
                icon={TriangleAlert}
                tone="error"
                title={t.auth.tokens.loadFailed}
                action={
                  <Button variant="outline" size="sm" onClick={load}>
                    {t.words.retry}
                  </Button>
                }
              />
            ) : tokens === null ? (
              <div aria-busy="true" aria-label={t.words.loading} className="flex flex-col gap-2 py-2">
                <div className="h-9 animate-pulse rounded-md bg-column" />
                <div className="h-9 animate-pulse rounded-md bg-column" />
              </div>
            ) : tokens.length === 0 ? (
              !created && <p className="py-2 text-sm text-fg-2">{t.auth.tokens.empty}</p>
            ) : (
              <ul className="flex flex-col">
                {tokens.map((token) => (
                  <TokenRow
                    key={token.id}
                    token={token}
                    onRevoke={() => setRevoking(token)}
                    onSessionExpired={sessionExpired}
                  />
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
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <Input
                  className="min-w-0 flex-1"
                  value={name}
                  maxLength={NAME_MAX}
                  placeholder={t.auth.tokens.form.placeholder}
                  aria-label={t.auth.tokens.form.label}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? "token-name-error" : undefined}
                  onChange={(event) => setName(event.target.value)}
                />
                <Segmented<TokenTier>
                  value={tier}
                  options={tierOptions}
                  onChange={setTier}
                  label={t.auth.tokens.form.permission}
                  className="w-max"
                />
                <Button type="submit" disabled={creating} className="self-start sm:self-auto">
                  {t.words.create}
                </Button>
              </div>
              <p className="text-xs text-fg-2">{t.auth.tokens.tierDescriptions[tier]}</p>
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
            <AlertDialogTitle>
              {disconnecting ? t.auth.tokens.disconnectTitle(revoking?.name ?? "") : t.auth.tokens.revokeTitle(revoking?.name ?? "")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {disconnecting ? t.auth.tokens.disconnectDescription : t.auth.tokens.revokeDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.words.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void revoke()}>
              {disconnecting ? t.auth.tokens.disconnect : t.auth.tokens.revoke}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
