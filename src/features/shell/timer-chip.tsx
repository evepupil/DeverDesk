"use client"

import { cn } from "cn"
import { Square } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"

import { ProjectMark } from "@/components/base/marks"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatClock, formatMinutesLong } from "@/domain/format"
import { minutesOf } from "@/domain/tasks"
import { focusRing } from "@/lib/styles"
import { useNow, useProjectsById } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"

/**
 * 窗口栏里的计时条：正在做哪件事、做了多久。点名字打开任务，点方块停止。
 * 计时时浏览器标签页的标题前面也带上时长，切到别的页面也看得到。
 */
export function TimerChip() {
  const timer = useWorkbench((state) => state.timer)
  const stopTimer = useWorkbench((state) => state.stopTimer)
  const openTask = useUi((state) => state.openTask)
  const project = useProjectsById().get(timer?.projectId ?? "")
  const now = useNow(1000)
  const elapsed = timer ? formatClock(now - timer.startedAt) : ""

  useEffect(() => {
    if (!timer) return
    const base = document.title.replace(/^\d{2}:\d{2}:\d{2} · /, "")
    document.title = `${elapsed} · ${base}`
    return () => {
      document.title = document.title.replace(/^\d{2}:\d{2}:\d{2} · /, "")
    }
  }, [timer, elapsed])

  if (!timer) return null

  const stop = () => {
    const entry = stopTimer()
    if (!useWorkbench.getState().lastSaveOk) return
    toast.success(entry ? `记下 ${formatMinutesLong(minutesOf(entry))}` : "不到一分钟，没有记录", {
      description: timer.label,
    })
  }

  return (
    <div className="mr-1 flex h-[26px] max-w-[min(260px,40vw)] min-w-0 items-center rounded-md border border-progress/40 bg-card text-sm shadow-xs">
      <button
        type="button"
        onClick={() => timer.taskId && openTask(timer.taskId)}
        className={cn("flex h-full min-w-0 items-center gap-1.5 rounded-l-md pr-1.5 pl-2 hover:bg-hover", focusRing)}
        aria-label={`正在计时：${timer.label}，已用 ${elapsed}`}
      >
        <span aria-hidden className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-progress opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-1.5 rounded-full bg-progress" />
        </span>
        {project && <ProjectMark name={project.name} color={project.color} size={14} className="hidden sm:inline-flex" />}
        <span className="hidden min-w-0 truncate sm:inline">{timer.label}</span>
        <span className="shrink-0 text-xs text-warn tabular">{elapsed}</span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={stop}
            aria-label="停止计时"
            className={cn(
              "flex h-full w-7 shrink-0 items-center justify-center rounded-r-md border-l border-line text-fg-2 hover:bg-hover hover:text-fg",
              focusRing
            )}
          >
            <Square className="size-3 fill-current" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">停止计时</TooltipContent>
      </Tooltip>
    </div>
  )
}
