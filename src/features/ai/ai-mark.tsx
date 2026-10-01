"use client"

import { Sparkles } from "lucide-react"

import type { RecordOrigin } from "@/domain/types"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/react"

export function AiMark({ origin }: { origin?: RecordOrigin }) {
  const t = useT()
  if (origin !== "ai") return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={t.ai.mark} className="inline-flex size-3 shrink-0 items-center justify-center text-fg-3">
          <Sparkles className="size-3" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>{t.ai.mark}</TooltipContent>
    </Tooltip>
  )
}
