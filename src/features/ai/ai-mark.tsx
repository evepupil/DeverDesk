"use client"

import { Sparkles, SquareTerminal } from "lucide-react"

import type { RecordOrigin } from "@/domain/types"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/react"

export function AiMark({ origin }: { origin?: RecordOrigin }) {
  const t = useT()
  if (!origin) return null
  const label = origin === "ai" ? t.ai.mark : t.ai.automaticMark

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={label} className="inline-flex size-3 shrink-0 items-center justify-center text-fg-3">
          {origin === "ai" ? <Sparkles className="size-3" aria-hidden /> : <SquareTerminal className="size-3" aria-hidden />}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>{label}</TooltipContent>
    </Tooltip>
  )
}
