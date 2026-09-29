"use client"

import type { ReactNode } from "react"

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useT } from "@/i18n/react"
import { useUi } from "@/state/ui"

/** 手机和窄屏：侧栏收进左侧抽屉（提炼补全：手机侧栏） */
export function MobileNav({ children }: { children: (close: () => void) => ReactNode }) {
  const open = useUi((state) => state.mobileNavOpen)
  const setOpen = useUi((state) => state.setMobileNavOpen)
  const t = useT()
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" showCloseButton={false} className="w-[280px] bg-window p-0 sm:max-w-[280px]">
        <SheetTitle className="sr-only">{t.shell.mobileNav.title}</SheetTitle>
        <SheetDescription className="sr-only">{t.shell.mobileNav.description}</SheetDescription>
        <div className="h-full pt-1">{children(() => setOpen(false))}</div>
      </SheetContent>
    </Sheet>
  )
}
