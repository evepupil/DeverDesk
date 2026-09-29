"use client"

import { useT } from "@/i18n/react"

/**
 * 加载态：页面脚本就绪前先画出同样的骨架，避免空白闪一下。
 * 只用静态标记，不依赖任何数据。
 */
function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-[#e8e8eb] ${className}`} />
}

export function ShellSkeleton() {
  const t = useT()
  return (
    <div aria-busy="true" aria-label={t.words.loading} className="flex h-dvh flex-col overflow-hidden bg-window">
      <div className="flex h-(--h-windowbar) shrink-0 items-center gap-2 px-3">
        <Bar className="h-4 w-16" />
        <Bar className="mx-auto hidden h-[26px] w-[clamp(240px,34vw,440px)] md:block" />
        <Bar className="size-5 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-(--w-sidebar) shrink-0 flex-col gap-2 px-4 pt-3 lg:flex">
          <Bar className="h-5 w-24" />
          <Bar className="mt-3 h-3.5 w-32" />
          <Bar className="h-3.5 w-28" />
          <Bar className="h-3.5 w-36" />
          <Bar className="mt-4 h-3.5 w-24" />
          <Bar className="h-3.5 w-32" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col lg:pr-2 lg:pb-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-line-2 bg-panel lg:rounded-lg lg:border">
            <div className="flex h-(--h-viewbar) items-center gap-2 border-b border-line px-3">
              <Bar className="h-3.5 w-28" />
            </div>
            <div className="flex h-(--h-filterbar) items-center gap-2 border-b border-line px-3">
              <Bar className="h-3.5 w-14" />
            </div>
            <div className="grid flex-1 gap-2 p-3 xl:grid-cols-4">
              <div className="h-64 animate-pulse rounded-lg bg-column xl:col-span-3" />
              <div className="hidden h-64 animate-pulse rounded-lg bg-column xl:block" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
