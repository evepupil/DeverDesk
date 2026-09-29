"use client"

import { cn } from "cn"
import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

import { useT } from "@/i18n/react"
import { focusRing } from "@/lib/styles"
import { useShellCrumb } from "./shell-context"

export interface ViewTab {
  key: string
  label: string
}

/**
 * 工作区的三段：40px 团队/视图栏 + 40px 筛选栏 + 可滚动内容（提炼）。
 * 不放页面大标题，当前页面名只用 13px 中等字重（提炼：不靠粗大标题）。
 */
export function PageFrame({
  title,
  meta,
  tabs,
  activeTab,
  onTabChange,
  actions,
  filterBar,
  children,
  contentClassName,
}: {
  title: string
  /** 标题后面的补充信息，比如日期 */
  meta?: ReactNode
  tabs?: ViewTab[]
  activeTab?: string
  onTabChange?(key: string): void
  actions?: ReactNode
  filterBar?: ReactNode
  children: ReactNode
  contentClassName?: string
}) {
  const t = useT()
  const crumb = useShellCrumb()
  return (
    <>
      <div className="flex h-(--h-viewbar) shrink-0 items-center gap-2 border-b border-line px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {crumb && (
            <>
              {crumb.icon}
              <span className="hidden text-sm text-fg-2 sm:inline">{crumb.label}</span>
              <ChevronRight className="hidden size-3.5 shrink-0 text-fg-3 sm:inline" aria-hidden />
            </>
          )}
          <h1 className="truncate text-sm font-medium">{title}</h1>
          {meta && <div className="flex min-w-0 items-center gap-1.5 text-sm text-fg-2">{meta}</div>}
        </div>
        {tabs && tabs.length > 0 && (
          <div role="tablist" aria-label={t.frame.pageFrame.views} className="no-scrollbar ml-1 flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {tabs.map((tab) => {
              const selected = tab.key === activeTab
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onTabChange?.(tab.key)}
                  className={cn(
                    "h-6 shrink-0 rounded-md px-2 text-sm whitespace-nowrap transition-colors duration-(--dur-fast)",
                    focusRing,
                    selected ? "bg-selected text-fg" : "text-fg-2 hover:bg-hover hover:text-fg"
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        )}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {filterBar}
      <div className={cn("scroll-thin min-h-0 flex-1 overflow-auto", contentClassName)}>{children}</div>
    </>
  )
}

export function FilterBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-(--h-filterbar) shrink-0 items-center gap-2 border-b border-line px-3">
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">{left}</div>
      {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
    </div>
  )
}
