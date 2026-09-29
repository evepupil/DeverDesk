"use client"

import { cn } from "cn"
import { CalendarDays, CornerDownLeft, Plus, Timer } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ProjectMark } from "@/components/base/marks"
import { parseQuickAdd, type QuickToken } from "@/domain/quick-add"
import type { DayKey } from "@/domain/types"
import { useProjectsById } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { PriorityIcon } from "./task-bits"

function TokenChip({ token, projectColor }: { token: QuickToken; projectColor?: string }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md border border-line-2 bg-card px-1.5 text-xs text-fg-2">
      {token.kind === "estimate" && <Timer className="size-3 text-fg-3" aria-hidden />}
      {token.kind === "date" && <CalendarDays className="size-3 text-fg-3" aria-hidden />}
      {token.kind === "project" && projectColor && <ProjectMark name={token.label} color={projectColor} size={12} />}
      {token.kind === "priority" && <PriorityIcon priority={token.text.length === 1 ? 2 : token.text.length === 2 ? 3 : 4} />}
      {token.label}
    </span>
  )
}

/**
 * 快速添加：一行输入，回车就建好。可以顺手写上时长、#副业、日期和 !优先级，
 * 输入时下方即时显示识别结果。defaultDay 是没写日期时安排到的那天。
 */
export function QuickAdd({
  defaultDay,
  defaultProjectId = null,
  today,
  placeholder = "添加任务，例如：写周报 30m #技术博客 明天",
  className,
  autoFocus,
  onCreated,
}: {
  defaultDay: DayKey | null
  /** 没写 #副业 时归到哪个副业 */
  defaultProjectId?: string | null
  today: DayKey
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onCreated?: () => void
}) {
  const projects = useWorkbench((state) => state.projects)
  const createTask = useWorkbench((state) => state.createTask)
  const projectsById = useProjectsById()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const parsed = useMemo(() => parseQuickAdd(value, projects.filter((project) => project.stage !== "ended"), today), [value, projects, today])

  const submit = () => {
    if (!value.trim()) return
    if (!parsed.title) {
      setError("只识别出了时长、副业或日期，还缺任务名")
      return
    }
    const day = parsed.plannedFor ?? defaultDay
    const task = createTask({
      title: parsed.title,
      projectId: parsed.projectId ?? defaultProjectId,
      estimateMin: parsed.estimateMin ?? 30,
      plannedFor: day,
      priority: parsed.priority ?? 0,
      status: "todo",
    })
    setValue("")
    setError(null)
    onCreated?.()
    if (useWorkbench.getState().lastSaveOk) toast.success(`已添加 ${task.id}`, { description: task.title, duration: 2000 })
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex h-9 items-center gap-2.5 px-3">
        <Plus className="size-4 shrink-0 text-fg-3" aria-hidden />
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
            if (event.key === "Escape") setValue("")
          }}
          placeholder={placeholder}
          aria-label="快速添加任务"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "quick-add-error" : undefined}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-3 md:text-sm"
        />
        {value.trim() && (
          <span className="hidden items-center gap-1 text-xs text-fg-3 sm:flex">
            <CornerDownLeft className="size-3" aria-hidden />
            回车添加
          </span>
        )}
      </div>
      {(parsed.tokens.length > 0 || error) && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2 pl-9">
          {parsed.tokens.map((token) => (
            <TokenChip
              key={`${token.kind}-${token.text}`}
              token={token}
              projectColor={token.kind === "project" ? projectsById.get(parsed.projectId ?? "")?.color : undefined}
            />
          ))}
          {error && (
            <span id="quick-add-error" role="alert" className="text-xs text-bad">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
