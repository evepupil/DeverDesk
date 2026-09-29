"use client"

import { cn } from "cn"
import { Minimize2, Plus } from "lucide-react"
import { useState } from "react"

import { BoardColumn, CollapsedRow } from "@/components/base/board"
import { IconButton } from "@/components/base/icon-button"
import type { DayKey } from "@/domain/types"
import { formatMinutes } from "@/domain/format"
import { useT } from "@/i18n/react"
import { focusRing } from "@/lib/styles"
import type { TaskProperty } from "@/state/prefs"
import { useUi } from "@/state/ui"
import { TaskCard } from "../common/task-card"
import { useTaskDrop } from "../common/use-task-drop"
import type { TaskGroup } from "./task-groups"

const PAGE_SIZE = 40

function openMinutes(group: TaskGroup) {
  return group.items.reduce((sum, task) => sum + (task.status === "done" || task.status === "dropped" ? 0 : task.estimateMin), 0)
}

function Column({
  group,
  today,
  properties,
  onCollapse,
  onDropTask,
}: {
  group: TaskGroup
  today: DayKey
  properties: TaskProperty[]
  onCollapse(): void
  onDropTask(taskId: string, group: TaskGroup): void
}) {
  const openTaskForm = useUi((state) => state.openTaskForm)
  const t = useT()
  const [limit, setLimit] = useState(PAGE_SIZE)
  const { over, dropProps } = useTaskDrop((taskId) => onDropTask(taskId, group))
  const minutes = openMinutes(group)

  return (
    <div {...dropProps} className="flex max-h-full w-[288px] shrink-0 snap-start xl:w-auto xl:max-w-[380px] xl:min-w-[260px] xl:flex-1">
      <BoardColumn
        icon={group.icon}
        title={group.label}
        count={group.items.length}
        meta={minutes > 0 ? formatMinutes(minutes) : undefined}
        className={cn("max-h-full w-full transition-[outline-color]", over && "outline-2 outline-offset-[-2px] outline-dashed outline-line-3")}
        bodyClassName="scroll-thin overflow-y-auto"
        actions={
          <>
            <IconButton
              label={t.tasks.board.newInGroup(group.label)}
              size="icon-xs"
              onClick={() => openTaskForm({ mode: "create", preset: group.preset })}
            >
              <Plus />
            </IconButton>
            <IconButton label={t.tasks.board.collapseColumn} size="icon-xs" onClick={onCollapse}>
              <Minimize2 />
            </IconButton>
          </>
        }
      >
        {group.items.length === 0 ? (
          <p className="px-2 pb-2 text-sm text-fg-2">{t.tasks.board.emptyGroup}</p>
        ) : (
          <>
            {group.items.slice(0, limit).map((task) => (
              <TaskCard key={task.id} task={task} today={today} properties={properties} draggable />
            ))}
            {group.items.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
                className={cn("h-8 shrink-0 rounded-md text-sm text-fg-2 hover:bg-hover hover:text-fg", focusRing)}
              >
                {t.tasks.board.more(group.items.length - limit)}
              </button>
            )}
          </>
        )}
      </BoardColumn>
    </div>
  )
}

/**
 * 任务看板：展开的分组并排成列，已完成、已搁置收成最右一列的短行（提炼）。
 * 卡片可以拖到别的列，拖到哪列就改成哪列的状态 / 副业 / 优先级。
 */
export function TasksBoard({
  groups,
  today,
  properties,
  showEnded,
  onDropTask,
}: {
  groups: TaskGroup[]
  today: DayKey
  properties: TaskProperty[]
  showEnded: boolean
  onDropTask(taskId: string, group: TaskGroup): void
}) {
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const t = useT()
  const isCollapsed = (group: TaskGroup) => group.collapsed !== toggled.has(group.key)
  const flip = (key: string) =>
    setToggled((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const expanded = groups.filter((group) => !isCollapsed(group))
  const collapsed = groups.filter((group) => isCollapsed(group) && (showEnded || !group.collapsed))

  return (
    <div className="scroll-thin flex h-full min-h-0 items-start gap-(--gap-card) overflow-x-auto scroll-px-3 p-3 max-md:snap-x max-md:snap-mandatory">
      {expanded.map((group) => (
        <Column
          key={group.key}
          group={group}
          today={today}
          properties={properties}
          onCollapse={() => flip(group.key)}
          onDropTask={onDropTask}
        />
      ))}
      {collapsed.length > 0 && (
        <div className="flex w-[240px] shrink-0 snap-start flex-col gap-px rounded-lg bg-column p-1 xl:w-auto xl:max-w-[320px] xl:min-w-[200px] xl:flex-1">
          {collapsed.map((group) => (
            <CollapsedRow
              key={group.key}
              icon={group.icon}
              label={group.label}
              count={group.items.length}
              onClick={() => flip(group.key)}
              aria-label={t.tasks.board.expandGroup(group.label, group.items.length)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
