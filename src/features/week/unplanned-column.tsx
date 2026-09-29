"use client"

import { cn } from "cn"
import { Inbox } from "lucide-react"
import { useState } from "react"

import { BoardColumn } from "@/components/base/board"
import { StatusIcon } from "@/components/base/status-icon"
import type { DayKey, Task } from "@/domain/types"
import { useT } from "@/i18n/react"
import { focusRing } from "@/lib/styles"
import { useWorkbench } from "@/state/store"
import { TaskCard } from "../common/task-card"
import { useTaskDrop } from "../common/use-task-drop"

const PAGE_SIZE = 20

function CardList({ tasks, today }: { tasks: Task[]; today: DayKey }) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const t = useT()
  return (
    <>
      {tasks.slice(0, limit).map((task) => (
        <TaskCard key={task.id} task={task} today={today} properties={["id", "estimate", "project", "priority", "plan", "due"]} draggable />
      ))}
      {tasks.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
          className={cn("h-8 shrink-0 rounded-md text-sm text-fg-2 hover:bg-hover hover:text-fg", focusRing)}
        >
          {t.week.showMore(tasks.length - limit)}
        </button>
      )}
    </>
  )
}

/** 右侧：之前没做完的、还没排日子的任务。拖到左边某一天就排上，拖回来就取消安排 */
export function UnplannedColumn({ earlier, unplanned, today }: { earlier: Task[]; unplanned: Task[]; today: DayKey }) {
  const planTask = useWorkbench((state) => state.planTask)
  const { over, dropProps } = useTaskDrop((taskId) => planTask(taskId, null))
  const t = useT()

  return (
    <div
      {...dropProps}
      className={cn(
        "flex min-w-0 flex-col gap-(--gap-card) rounded-lg transition-[outline-color] duration-(--dur-fast)",
        over && "outline-2 outline-offset-2 outline-dashed outline-line-3"
      )}
    >
      {earlier.length > 0 && (
        <BoardColumn icon={<StatusIcon glyph="half" tone="progress" />} title={t.week.earlier} count={earlier.length}>
          <CardList tasks={earlier} today={today} />
        </BoardColumn>
      )}
      <BoardColumn icon={<Inbox className="size-4 text-fg-2" aria-hidden />} title={t.week.unplannedTitle} count={unplanned.length}>
        {unplanned.length === 0 ? (
          <p className="px-2 pb-2 text-sm text-fg-2">{t.week.allPlanned}</p>
        ) : (
          <CardList tasks={unplanned} today={today} />
        )}
      </BoardColumn>
    </div>
  )
}
