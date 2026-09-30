"use client"

import { cn } from "cn"

import { GithubMark } from "@/components/base/marks"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/react"
import { REPO_URL } from "@/lib/edition"
import { focusRing } from "@/lib/styles"

/**
 * 本地版窗口栏里的仓库入口：和旁边只有图标的按钮一个样子。
 * 指向自家仓库，只写 noopener、不加 noreferrer：GitHub 仓库的流量页才数得到演示站带去了多少人。
 */
export function RepoLink() {
  const t = useT()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener"
          aria-label={t.edition.repo.label}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg-2 transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg",
            focusRing
          )}
        >
          <GithubMark />
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {t.edition.repo.label}
      </TooltipContent>
    </Tooltip>
  )
}
