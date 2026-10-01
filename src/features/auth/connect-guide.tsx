"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/base/segmented"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/react"
import { MCP_PATH } from "@/sync/protocol"
import { copyText } from "@/lib/platform"
import { buildSnippets, type ConnectClient } from "./connect-snippets"

const CLIENTS: ConnectClient[] = ["claudeCode", "codex", "cursor", "vscode", "other"]

export function ConnectGuide({ token, accessSession }: { token: string; accessSession: boolean }) {
  const t = useT()
  const [client, setClient] = useState<ConnectClient>("claudeCode")
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snippets = useMemo(() => buildSnippets(`${window.location.origin}${MCP_PATH}`, token), [token])
  const clientOptions = CLIENTS.map((value) => ({ value, label: t.auth.tokens.connect.clients[value] }))

  useEffect(
    () => () => {
      if (timeout.current !== null) clearTimeout(timeout.current)
    },
    []
  )

  const copy = async () => {
    if (!(await copyText(snippets[client]))) return
    setCopied(true)
    toast.success(t.auth.tokens.connect.copied)
    if (timeout.current !== null) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="mt-4 flex flex-col gap-2">
      <div className="overflow-x-auto pb-0.5">
        <Segmented<ConnectClient>
          label={t.auth.tokens.connect.clientSelector}
          value={client}
          options={clientOptions}
          onChange={setClient}
          className="w-max"
        />
      </div>
      <div className="relative rounded-md bg-window">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="absolute right-1.5 top-1.5 z-10">
          {copied ? <Check className="text-done" /> : <Copy />}
          {copied ? t.auth.tokens.connect.copied : t.auth.tokens.connect.copy}
        </Button>
        <pre
          aria-label={t.auth.tokens.connect.configurationFor(clientOptions.find((option) => option.value === client)?.label ?? "")}
          className="max-h-48 overflow-auto whitespace-pre p-3 pt-10 font-mono text-xs leading-relaxed"
        >
          {snippets[client]}
        </pre>
      </div>
      {accessSession && <p className="text-xs text-fg-2">{t.auth.tokens.connect.accessHint}</p>}
    </section>
  )
}
