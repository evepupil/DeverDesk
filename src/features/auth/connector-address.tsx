"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/react"
import { copyText } from "@/lib/platform"
import { MCP_PATH } from "@/sync/protocol"

/** 连接器地址：ChatGPT、Claude 网页版这类应用填它，连接时会跳到授权页让你点允许，不用复制令牌 */
export function ConnectorAddress({ accessSession }: { accessSession: boolean }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [address] = useState(() => `${window.location.origin}${MCP_PATH}`)

  useEffect(
    () => () => {
      if (timeout.current !== null) clearTimeout(timeout.current)
    },
    []
  )

  const copy = async () => {
    if (!(await copyText(address))) return
    setCopied(true)
    toast.success(t.auth.tokens.connect.copied)
    if (timeout.current !== null) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mb-4 flex flex-col gap-1.5 border-b border-line pb-4">
      <div className="flex gap-1.5">
        <Input
          readOnly
          value={address}
          aria-label={t.auth.tokens.connector.label}
          className="min-w-0 flex-1 font-mono"
          onFocus={(event) => event.target.select()}
        />
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="text-done" /> : <Copy />}
          {copied ? t.auth.tokens.connect.copied : t.auth.tokens.connect.copy}
        </Button>
      </div>
      <p className="text-xs text-fg-2">{t.auth.tokens.connector.hint}</p>
      {accessSession && <p className="text-xs text-fg-2">{t.auth.tokens.connector.accessHint}</p>}
    </div>
  )
}
