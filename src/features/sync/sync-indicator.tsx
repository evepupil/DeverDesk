"use client"

import { cn } from "cn"
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react"
import { useSyncExternalStore } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { focusRing } from "@/lib/styles"
import { syncNow, useSync } from "@/state/sync"

const serverFalse = () => false

/** 开启「减少动态效果」时图标不转 */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChanged) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)")
      query.addEventListener("change", onChanged)
      return () => query.removeEventListener("change", onChanged)
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    serverFalse
  )
}

/**
 * 窗口栏里的同步状态：一个只有图标的按钮，点一下立刻同步。
 * idle、unauthorized 时不渲染。
 */
export function SyncIndicator() {
  const status = useSync((state) => state.status)
  const pending = useSync((state) => state.pending)
  const message = useSync((state) => state.message)
  const reducedMotion = useReducedMotion()

  if (status !== "syncing" && status !== "synced" && status !== "offline" && status !== "error") return null

  const Icon =
    status === "syncing" ? RefreshCw : status === "offline" ? CloudOff : status === "error" ? TriangleAlert : Cloud
  const hint =
    status === "syncing"
      ? "正在同步"
      : status === "synced"
        ? "已同步"
        : status === "offline"
          ? pending > 0
            ? `离线，${pending} 条改动联网后上传`
            : "离线"
          : `${message || "同步出错"}，点一下重试`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={hint}
          onClick={() => void syncNow()}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg-2 transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg",
            focusRing
          )}
        >
          <Icon className={cn("size-4", status === "syncing" && !reducedMotion && "animate-spin")} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}
