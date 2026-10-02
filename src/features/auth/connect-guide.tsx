"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/base/segmented"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/react"
import { copyText } from "@/lib/platform"
import { buildSnippets, type ConnectClient } from "./connect-snippets"

const CLIENTS: ConnectClient[] = ["claudeCode", "codex", "cursor", "vscode", "other", "recorder"]

function SnippetBlock({
  value,
  label,
  copied,
  onCopy,
}: {
  value: string
  label: string
  copied: boolean
  onCopy(): void
}) {
  const t = useT()

  return (
    <div className="relative rounded-md bg-window">
      <Button type="button" variant="outline" size="sm" onClick={onCopy} className="absolute right-1.5 top-1.5 z-10">
        {copied ? <Check className="text-done" /> : <Copy />}
        {copied ? t.auth.tokens.connect.copied : t.auth.tokens.connect.copy}
      </Button>
      <pre aria-label={label} className="max-h-48 overflow-auto whitespace-pre p-3 pt-10 font-mono text-xs leading-relaxed">
        {value}
      </pre>
    </div>
  )
}

export function ConnectGuide({ token, accessSession }: { token: string; accessSession: boolean }) {
  const t = useT()
  const [client, setClient] = useState<ConnectClient>("claudeCode")
  const [copied, setCopied] = useState<string | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snippets = useMemo(() => buildSnippets(window.location.origin, token), [token])
  const clientOptions = CLIENTS.map((value) => ({ value, label: t.auth.tokens.connect.clients[value] }))
  const [pluginCommands, setupCommand] = snippets.recorder.split("\n\n")
  const selectedClientName = clientOptions.find((option) => option.value === client)?.label ?? ""

  useEffect(
    () => () => {
      if (timeout.current !== null) clearTimeout(timeout.current)
    },
    []
  )

  const copy = async (value: string, id: string) => {
    if (!(await copyText(value))) return
    setCopied(id)
    toast.success(t.auth.tokens.connect.copied)
    if (timeout.current !== null) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setCopied(null), 1600)
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
      {client === "recorder" ? (
        <>
          <SnippetBlock
            value={pluginCommands ?? snippets.recorder}
            label={t.auth.tokens.connect.recorderPluginCommands}
            copied={copied === "recorder-plugin"}
            onCopy={() => void copy(pluginCommands ?? snippets.recorder, "recorder-plugin")}
          />
          <SnippetBlock
            value={setupCommand ?? ""}
            label={t.auth.tokens.connect.recorderSetupCommand}
            copied={copied === "recorder-setup"}
            onCopy={() => void copy(setupCommand ?? "", "recorder-setup")}
          />
          <p className="text-xs text-fg-2">{t.auth.tokens.connect.recorderCodexHint}</p>
          <p className="text-xs text-fg-2">{t.auth.tokens.connect.recorderPermissionHint}</p>
        </>
      ) : (
        <SnippetBlock
          value={snippets[client]}
          label={t.auth.tokens.connect.configurationFor(selectedClientName)}
          copied={copied === client}
          onCopy={() => void copy(snippets[client], client)}
        />
      )}
      {accessSession && <p className="text-xs text-fg-2">{client === "recorder" ? t.auth.tokens.connect.recorderAccessHint : t.auth.tokens.connect.accessHint}</p>}
    </section>
  )
}
