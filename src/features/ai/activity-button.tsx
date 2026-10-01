"use client"

import { cn } from "cn"
import { Sparkles } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/react"
import { focusRing } from "@/lib/styles"
import { openAiActivity, useAiActivityStore } from "./use-ai-activity"

export function ActivityButton() {
  const t = useT()
  const count = useAiActivityStore((state) => state.pendingCount)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t.ai.activity}
          onClick={() => void openAiActivity()}
          className={cn("relative inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg-2 transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg", focusRing)}
        >
          <Sparkles className="size-4" aria-hidden />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-[4px] bg-fg px-0.5 font-mono text-[10px] leading-none text-window tabular">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>{t.ai.activity}</TooltipContent>
    </Tooltip>
  )
}
