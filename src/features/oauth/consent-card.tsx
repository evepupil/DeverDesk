"use client"

import { cn } from "cn"
import { useState } from "react"

import { Segmented } from "@/components/base/segmented"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/react"
import { DEFAULT_TOKEN_TIER, TOKEN_TIERS, type AuthorizeClientView, type AuthorizeDecision, type TokenTier } from "@/sync/protocol"

/**
 * 授权卡：谁想连、授权后回到哪个网站、给什么权限、拒绝或允许。
 * 名字是对方自报的，网站才是判断真假的依据，所以网站用等宽字单独醒目显示；跳回本机时换成提醒色。
 */
export function ConsentCard({
  client,
  pending,
  error,
  onDecide,
}: {
  client: AuthorizeClientView
  /** 正在提交的那个选择；提交中两个按钮都禁用 */
  pending: AuthorizeDecision | null
  error: string | null
  onDecide(decision: AuthorizeDecision, tier: TokenTier): void
}) {
  const t = useT()
  const [tier, setTier] = useState<TokenTier>(DEFAULT_TOKEN_TIER)
  const tierOptions = TOKEN_TIERS.map((value) => ({ value, label: t.auth.tokens.tiers[value] }))

  return (
    <div className="flex flex-col">
      <h1 className="line-clamp-2 text-base leading-snug font-medium break-words text-fg">{t.oauth.title(client.name)}</h1>
      <p className={cn("mt-1.5 text-sm", client.loopback ? "text-warn" : "text-fg-2")}>
        {client.loopback ? t.oauth.returnToLocal : t.oauth.returnTo}{" "}
        <span className="font-mono font-medium break-all text-fg">{client.host}</span>
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-fg-2">{t.oauth.permission}</span>
        <Segmented<TokenTier> value={tier} options={tierOptions} onChange={setTier} label={t.oauth.permission} />
      </div>
      <p className="mt-1.5 text-right text-xs text-fg-2">{t.auth.tokens.tierDescriptions[tier]}</p>

      {error && (
        <p role="alert" className="mt-3 text-xs text-bad">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={pending !== null} onClick={() => onDecide("deny", tier)}>
          {t.oauth.deny}
        </Button>
        <Button type="button" disabled={pending !== null} onClick={() => onDecide("allow", tier)}>
          {pending === "allow" ? t.oauth.allowing : t.oauth.allow}
        </Button>
      </div>
    </div>
  )
}
