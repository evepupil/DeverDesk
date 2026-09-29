"use client"

import { cn } from "cn"
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useT } from "@/i18n/react"
import { focusRing } from "@/lib/styles"
import { useToday } from "@/state/hooks"
import { useUi } from "@/state/ui"
import { QuickAdd } from "../common/quick-add"

/**
 * 手机上的快速记录：右下角一个圆钮，拉起底部面板，一行加任务，或者直接记收入、支出。
 * 桌面有快捷键和顶部按钮，不显示这个圆钮。
 */
export function QuickCapture() {
  const t = useT()
  const open = useUi((state) => state.quickAddOpen)
  const setOpen = useUi((state) => state.setQuickAddOpen)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const today = useToday()

  const record = (kind: "income" | "expense") => {
    setOpen(false)
    openEntryForm({ mode: "create", preset: { kind, category: kind === "income" ? "sales" : "server" } })
  }

  return (
    <>
      <button
        type="button"
        aria-label={t.frame.quickCapture.label}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex size-12 items-center justify-center rounded-full bg-fg text-white shadow-lg transition-transform duration-(--dur-fast) active:scale-95 lg:hidden",
          focusRing
        )}
      >
        <Plus className="size-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-xl p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="border-b border-line px-4 py-3">
            <SheetTitle>{t.frame.quickCapture.label}</SheetTitle>
            <SheetDescription className="sr-only">{t.frame.quickCapture.description}</SheetDescription>
          </SheetHeader>
          <div className="border-b border-line py-1">
            <QuickAdd defaultDay={today} today={today} autoFocus placeholder={t.frame.quickCapture.placeholder} onCreated={() => setOpen(false)} />
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            <Button variant="outline" className="h-10" onClick={() => record("income")}>
              <ArrowDownLeft className="text-good" />
              {t.frame.quickCapture.income}
            </Button>
            <Button variant="outline" className="h-10" onClick={() => record("expense")}>
              <ArrowUpRight className="text-bad" />
              {t.frame.quickCapture.expense}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
