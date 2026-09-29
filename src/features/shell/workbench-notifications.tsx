"use client"

import { cn } from "cn"
import { Bell, BellOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { focusRingInset } from "@/lib/styles"
import { useToday, useWorkbenchData } from "@/state/hooks"
import { useUi } from "@/state/ui"
import { deriveWorkbenchAlerts, type WorkbenchAlert } from "./alerts"

/** 右上角的提醒：逾期、延期、排超了、钱没到账。点一条直接去处理 */
export function WorkbenchNotifications() {
  const router = useRouter()
  const data = useWorkbenchData()
  const today = useToday()
  const readIds = useUi((state) => state.readAlertIds)
  const markRead = useUi((state) => state.markAlertsRead)
  const openTask = useUi((state) => state.openTask)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const [open, setOpen] = useState(false)

  const alerts = useMemo(() => deriveWorkbenchAlerts(data, today), [data, today])
  const unread = alerts.filter((alert) => !readIds.includes(alert.id))

  const handle = (alert: WorkbenchAlert) => {
    markRead([alert.id])
    setOpen(false)
    if (alert.target.kind === "task") openTask(alert.target.taskId)
    else if (alert.target.kind === "entry") openEntryForm({ mode: "edit", entryId: alert.target.entryId })
    else router.push(alert.target.href)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-fg-2"
          aria-label={unread.length ? `提醒，${unread.length} 条未读` : "提醒"}
        >
          <Bell />
          {unread.length > 0 && (
            <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-risk ring-2 ring-window" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] gap-0 p-0">
        <div className="flex h-10 items-center justify-between border-b border-line pr-2 pl-3">
          <span className="text-sm font-medium">提醒</span>
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markRead(unread.map((alert) => alert.id))}>
              全部标为已读
            </Button>
          )}
        </div>
        {alerts.length === 0 ? (
          <EmptyState icon={BellOff} title="没有需要处理的事" />
        ) : (
          <ul className="scroll-thin max-h-[min(420px,60vh)] overflow-y-auto p-1">
            {alerts.map((alert) => {
              const isUnread = !readIds.includes(alert.id)
              return (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() => handle(alert)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-hover focus-visible:bg-hover",
                      focusRingInset
                    )}
                  >
                    <StatusIcon glyph={alert.status.glyph} tone={alert.status.tone} label={alert.status.label} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm", !isUnread && "text-fg-2")}>{alert.title}</span>
                      <span className="block truncate text-xs text-fg-2">{alert.detail}</span>
                    </span>
                    {isUnread && <span aria-label="未读" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-done" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
