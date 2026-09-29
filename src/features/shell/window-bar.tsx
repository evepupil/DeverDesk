"use client"

import { cn } from "cn"
import { ArrowLeft, ArrowRight, Keyboard, Menu, PanelLeft, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

import { IconButton } from "@/components/base/icon-button"
import { Kbd } from "@/components/ui/kbd"
import { useIsMac } from "@/lib/platform"
import { focusRing } from "@/lib/styles"
import { usePrefs } from "@/state/prefs"
import { useUi } from "@/state/ui"

export interface WindowBarProps {
  /** 居中搜索框里的提示文字 */
  searchLabel: string
  /** 放在提醒左边的额外控件，比如正在计时的任务 */
  extras?: ReactNode
  notifications?: ReactNode
  userMenu: ReactNode
}

/** 第一层：约 38px 的窗口操作栏（提炼）。网页里放前进后退、搜索、提醒和头像 */
export function WindowBar({ searchLabel, extras, notifications, userMenu }: WindowBarProps) {
  const router = useRouter()
  const isMac = useIsMac()
  const collapsed = usePrefs((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = usePrefs((state) => state.setSidebarCollapsed)
  const setCommandOpen = useUi((state) => state.setCommandOpen)
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen)
  const setMobileNavOpen = useUi((state) => state.setMobileNavOpen)

  return (
    <header className="relative flex h-(--h-windowbar) shrink-0 items-center gap-1 px-2">
      <div className="flex items-center gap-0.5">
        <IconButton label="打开导航" className="lg:hidden" onClick={() => setMobileNavOpen(true)}>
          <Menu />
        </IconButton>
        <IconButton
          label={collapsed ? "展开侧栏" : "收起侧栏"}
          shortcut="["
          className="hidden lg:inline-flex"
          onClick={() => setSidebarCollapsed(!collapsed)}
        >
          <PanelLeft />
        </IconButton>
        <IconButton label="后退" className="hidden sm:inline-flex" onClick={() => router.back()}>
          <ArrowLeft />
        </IconButton>
        <IconButton label="前进" className="hidden sm:inline-flex" onClick={() => router.forward()}>
          <ArrowRight />
        </IconButton>
      </div>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className={cn(
          "absolute top-1/2 left-1/2 hidden h-[26px] w-[clamp(240px,34vw,440px)] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md border border-line-2 bg-card/70 pr-1 pl-2 text-sm text-fg-2 transition-colors duration-(--dur-fast) hover:border-line-3 hover:bg-card md:flex",
          focusRing
        )}
      >
        <Search className="size-3.5 text-fg-3" aria-hidden />
        <span className="truncate">{searchLabel}</span>
        <Kbd className="ml-auto">{isMac ? "⌘K" : "Ctrl K"}</Kbd>
      </button>

      <div className="ml-auto flex items-center gap-0.5">
        {extras}
        <IconButton label="搜索" className="md:hidden" onClick={() => setCommandOpen(true)}>
          <Search />
        </IconButton>
        {notifications}
        <IconButton label="键盘快捷键" shortcut="?" className="hidden sm:inline-flex" onClick={() => setShortcutsOpen(true)}>
          <Keyboard />
        </IconButton>
        {userMenu}
      </div>
    </header>
  )
}
