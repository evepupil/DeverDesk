"use client"

import type { ReactNode } from "react"

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useUi } from "@/state/ui"

/** 手机和窄屏：侧栏收进左侧抽屉（提炼补全：手机侧栏） */
export function MobileNav({ children }: { children: (close: () => void) => ReactNode }) {
  const open = useUi((state) => state.mobileNavOpen)
  const setOpen = useUi((state) => state.setMobileNavOpen)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" showCloseButton={false} className="w-[280px] bg-window p-0 sm:max-w-[280px]">
        <SheetTitle className="sr-only">导航</SheetTitle>
        <SheetDescription className="sr-only">页面与常用视图</SheetDescription>
        <div className="h-full pt-1">{children(() => setOpen(false))}</div>
      </SheetContent>
    </Sheet>
  )
}
