"use client"

import { KeyRound, Link2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/i18n/react"
import { updateTokenTier } from "@/lib/api"
import { getT } from "@/i18n/runtime"
import { TOKEN_TIERS, type TokenInfo, type TokenTier } from "@/sync/protocol"

function formatDay(at: number): string {
  const date = new Date(at)
  return getT().calendar.monthDay(date.getMonth() + 1, date.getDate())
}

function isTokenTier(value: string): value is TokenTier {
  return TOKEN_TIERS.some((tier) => tier === value)
}

export function TokenRow({
  token,
  onRevoke,
  onSessionExpired,
}: {
  token: TokenInfo
  onRevoke(): void
  onSessionExpired(cause: unknown): boolean
}) {
  const t = useT()
  const [tier, setTier] = useState(token.tier)
  const [updating, setUpdating] = useState(false)

  const update = async (value: string) => {
    if (!isTokenTier(value) || value === tier || updating) return
    const previous = tier
    setTier(value)
    setUpdating(true)
    try {
      await updateTokenTier(token.id, value)
    } catch (cause) {
      setTier(previous)
      if (!onSessionExpired(cause)) toast.error(t.auth.tokens.form.updateFailed)
    } finally {
      setUpdating(false)
    }
  }

  const tierOptions = TOKEN_TIERS.map((value) => ({ value, label: t.auth.tokens.tiers[value] }))
  // 经授权页连上的 AI 应用：多显示它的网站，按钮叫「断开」
  const authorized = token.kind === "oauth"
  const Icon = authorized ? Link2 : KeyRound
  const since = authorized ? t.auth.tokens.authorizedAt(formatDay(token.createdAt)) : t.auth.tokens.createdAt(formatDay(token.createdAt))
  const used = token.lastUsedAt === null ? t.auth.tokens.neverUsed : t.auth.tokens.lastUsed(formatDay(token.lastUsedAt))

  return (
    <li className="flex items-center gap-2 py-1.5">
      <Icon className="size-4 shrink-0 text-fg-3" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{token.name}</span>
        <span className="truncate text-xs text-fg-2">
          {authorized && token.host ? `${token.host} · ` : ""}
          {since} · {used}
        </span>
      </div>
      <Select value={tier} onValueChange={(value) => void update(value)} disabled={updating}>
        <SelectTrigger className="w-[116px] shrink-0" aria-label={t.auth.tokens.permissionFor(token.name)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {tierOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" onClick={onRevoke}>
        {authorized ? t.auth.tokens.disconnect : t.auth.tokens.revoke}
      </Button>
    </li>
  )
}
