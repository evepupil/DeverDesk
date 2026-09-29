"use client"

import { cn } from "cn"
import type { ReactNode } from "react"

import { StatusIcon } from "@/components/base/status-icon"
import { ProjectMark } from "@/components/base/marks"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ESTIMATE_PRESETS, PRIORITY, PRIORITY_ORDER, TASK_STATUS, TASK_STATUS_ORDER } from "@/data/catalog"
import { formatMinutes, formatMinutesLong } from "@/domain/format"
import { useT } from "@/i18n/react"
import type { Priority, Project, TaskStatus } from "@/domain/types"
import { PriorityIcon } from "./task-bits"

/** 详情和表单里共用的属性选择器 */

export function PropertySelect({
  id,
  value,
  onChange,
  children,
  className,
  ariaLabel,
}: {
  id?: string
  value: string
  onChange(value: string): void
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn("h-7 w-full justify-between border-transparent bg-transparent px-2 hover:border-line-2 hover:bg-card", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {children}
      </SelectContent>
    </Select>
  )
}

export function StatusOptions() {
  return TASK_STATUS_ORDER.map((status: TaskStatus) => (
    <SelectItem key={status} value={status}>
      <StatusIcon glyph={TASK_STATUS[status].glyph} tone={TASK_STATUS[status].tone} />
      {TASK_STATUS[status].label}
    </SelectItem>
  ))
}

export function PriorityOptions() {
  return PRIORITY_ORDER.map((priority: Priority) => (
    <SelectItem key={priority} value={String(priority)}>
      <PriorityIcon priority={priority} />
      {PRIORITY[priority].label}
    </SelectItem>
  ))
}

export const NO_PROJECT = "none"

export function ProjectOptions({ projects }: { projects: Project[] }) {
  const t = useT()
  const active = projects.filter((project) => project.stage !== "ended")
  return (
    <>
      <SelectItem value={NO_PROJECT}>{t.common.personal}</SelectItem>
      <SelectSeparator />
      {active.map((project) => (
        <SelectItem key={project.id} value={project.id}>
          <ProjectMark name={project.name} color={project.color} size={14} />
          {project.name}
        </SelectItem>
      ))}
    </>
  )
}

export function EstimateOptions({ current }: { current?: number }) {
  const values = current && !ESTIMATE_PRESETS.includes(current) ? [...ESTIMATE_PRESETS, current].sort((a, b) => a - b) : ESTIMATE_PRESETS
  return values.map((minutes) => (
    <SelectItem key={minutes} value={String(minutes)}>
      {formatMinutesLong(minutes)}
      <span className="ml-auto text-xs text-fg-3">{formatMinutes(minutes)}</span>
    </SelectItem>
  ))
}
