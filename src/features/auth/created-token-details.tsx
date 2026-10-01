"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/react"
import { copyText } from "@/lib/platform"
import type { CreatedToken } from "@/sync/protocol"
import { ConnectGuide } from "./connect-guide"

export function CreatedTokenDetails({ created, accessSession }: { created: CreatedToken; accessSession: boolean }) {
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t = useT()

  useEffect(
    () => () => {
      if (timeout.current !== null) clearTimeout(timeout.current)
    },
    []
  )

  const copy = async () => {
    if (!(await copyText(created.token))) return
    setCopied(true)
    toast.success(t.auth.tokens.created.copied)
    if (timeout.current !== null) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mb-4 border-b border-line pb-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <Input
            readOnly
            value={created.token}
            aria-label={t.auth.tokens.created.label}
            className="min-w-0 flex-1 font-mono"
            onFocus={(event) => event.target.select()}
          />
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? <Check className="text-done" /> : <Copy />}
            {copied ? t.auth.tokens.connect.copied : t.auth.tokens.connect.copy}
          </Button>
        </div>
        <p className="text-xs text-fg-2">{t.auth.tokens.created.hint}</p>
      </div>
      <ConnectGuide token={created.token} accessSession={accessSession} />
    </div>
  )
}
