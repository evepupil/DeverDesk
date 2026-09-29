"use client"

import { cn } from "cn"
import { ChevronRight, Plus } from "lucide-react"
import { useState } from "react"

import { IconButton } from "@/components/base/icon-button"
import { formatMinutes } from "@/domain/format"
import type { DayKey } from "@/domain/types"
import { focusRing, focusRingInset } from "@/lib/styles"
import { useUi } from "@/state/ui"
import { TaskRow } from "../common/task-row"
import { useTaskDrop } from "../common/use-task-drop"
import type { TaskGroup } from "./task-groups"

const PAGE_SIZE = 60

function GroupSection({
  group,
  today,
  collapsed,
  onToggle,
  onDropTask,
}: {
  group: TaskGroup
  today: DayKey
  collapsed: boolean
  onToggle(): void
  onDropTask(taskId: string, group: TaskGroup): void
}) {
  const openTaskForm = useUi((state) => state.openTaskForm)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const { over, dropProps } = useTaskDrop((taskId) => onDropTask(taskId, group))
  const headingId = `task-group-${group.key}`
  const minutes = group.items.reduce(
    (sum, task) => sum + (task.status === "done" || task.status === "dropped" ? 0 : task.estimateMin),
    0
  )

  return (
    <section aria-labelledby={headingId} {...dropProps} className={cn(over && "bg-hover")}>
      <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-line bg-raised pr-2 pl-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className={cn("flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sm hover:bg-hover", focusRing)}
        >
          <ChevronRight
            aria-hidden
            className={cn("size-3.5 text-fg-3 transition-transform duration-(--dur-fast)", !collapsed && "rotate-90")}
          />
          {group.icon}
          <span id={headingId} className="truncate font-medium">
            {group.label}
          </span>
          <span className="text-fg-2 tabular">{group.items.length}</span>
        </button>
        {minutes > 0 && <span className="text-xs text-fg-2 tabular">{formatMinutes(minutes)}</span>}
        <IconButton
          label={`在「${group.label}」新建`}
          size="icon-xs"
          className="ml-auto"
          onClick={() => openTaskForm({ mode: "create", preset: group.preset })}
        >
          <Plus />
        </IconButton>
      </div>
      {!collapsed && (
        <div>
          {group.items.slice(0, limit).map((task) => (
            <TaskRow key={task.id} task={task} today={today} draggable className="px-4" />
          ))}
          {group.items.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
              className={cn("h-9 w-full border-b border-line text-sm text-fg-2 hover:bg-hover hover:text-fg", focusRingInset)}
            >
              显示更多（还有 {group.items.length - limit} 件）
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** 任务列表：分组标题吸顶；已完成、已搁置默认收起；行可以拖到别的分组 */
export function TasksList({
  groups,
  today,
  showEnded,
  onDropTask,
}: {
  groups: TaskGroup[]
  today: DayKey
  showEnded: boolean
  onDropTask(taskId: string, group: TaskGroup): void
}) {
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const visible = groups.filter((group) => group.items.length > 0 && (showEnded || !group.collapsed))

  return (
    <div className="pb-20 lg:pb-6">
      {visible.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          today={today}
          collapsed={group.collapsed !== toggled.has(group.key)}
          onDropTask={onDropTask}
          onToggle={() =>
            setToggled((current) => {
              const next = new Set(current)
              if (next.has(group.key)) next.delete(group.key)
              else next.add(group.key)
              return next
            })
          }
        />
      ))}
    </div>
  )
}
