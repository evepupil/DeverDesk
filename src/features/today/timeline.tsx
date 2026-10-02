"use client"

import { cn } from "cn"
import { Check, Plus } from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react"

import { ProjectMark } from "@/components/base/marks"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { dayKeyOf, minuteOfDay, minutesToTime, parseDay, todayKey } from "@/domain/calendar"
import { formatMinutes } from "@/domain/format"
import { MIN_BLOCK, SLOT_STEP, blocksFor, layoutBlocks, type PlacedBlock } from "@/domain/planning"
import type { DayKey, Task } from "@/domain/types"
import { useT } from "@/i18n/react"
import { focusRingInset } from "@/lib/styles"
import { useNow, useProjectsById } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { TASK_DRAG_TYPE } from "../common/task-card"
import { ActualLane } from "./actual-lane-view"
import type { LiveWindowRow } from "./live-windows"

/** 每小时 56px，15 分钟一格；45 分钟的块刚好放下两行 */
const HOUR_PX = 56
const PX = HOUR_PX / 60

interface Span {
  start: number
  end: number
}

interface DragState extends Span {
  taskId: string
  mode: "move" | "resize"
  originY: number
  moved: boolean
}

const snap = (minutes: number) => Math.round(minutes / SLOT_STEP) * SLOT_STEP

/** 拖动或键盘调整后的新位置：限制在时间线范围内，最短 15 分钟 */
function adjust(block: Span, mode: "move" | "resize", delta: number, dayStart: number, dayEnd: number): Span {
  if (mode === "resize") {
    return { start: block.start, end: Math.min(dayEnd, Math.max(block.start + MIN_BLOCK, block.end + delta)) }
  }
  const length = block.end - block.start
  const start = Math.min(dayEnd - length, Math.max(dayStart, block.start + delta))
  return { start, end: start + length }
}

function Block({
  task,
  block,
  span,
  running,
  dayStart,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onOpen,
}: {
  task: Task
  block: PlacedBlock
  span: Span
  running: boolean
  dayStart: number
  onPointerDown(event: PointerEvent<HTMLButtonElement>): void
  onPointerMove(event: PointerEvent<HTMLButtonElement>): void
  onPointerUp(event: PointerEvent<HTMLButtonElement>): void
  onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void
  onOpen(): void
}) {
  const project = useProjectsById().get(task.projectId ?? "")
  const t = useT()
  const height = Math.max(MIN_BLOCK * PX, (span.end - span.start) * PX) - 2
  const width = 100 / block.lanes
  const compact = height < 38
  const done = task.status === "done"
  const range = `${minutesToTime(span.start)}–${minutesToTime(span.end)}`

  return (
    <button
      type="button"
      data-block
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onClick={onOpen}
      aria-label={t.today.timeline.blockAria(task.title, range)}
      className={cn(
        "group absolute z-10 flex min-w-0 touch-pan-y overflow-hidden rounded-md border bg-card pr-1.5 pl-3 text-left shadow-xs transition-[border-color,box-shadow] duration-(--dur-fast) select-none hover:border-line-3 hover:shadow-sm",
        compact ? "items-center gap-1.5" : "flex-col justify-start py-[3px]",
        running ? "border-progress/60" : "border-line-2",
        done && "bg-raised",
        focusRingInset
      )}
      style={{
        top: (span.start - dayStart) * PX + 1,
        height,
        left: `calc(${block.lane * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[3px] rounded-full"
        style={{ background: project ? `var(--label-${project.color})` : "var(--line-strong)" }}
      />
      <span className={cn("flex min-w-0 items-center gap-1 text-xs font-medium", done ? "text-fg-2" : "text-fg")}>
        {done && <Check className="size-3 shrink-0 text-done" aria-hidden />}
        <span className="truncate">{task.title}</span>
      </span>
      <span className={cn("shrink-0 text-xs text-fg-2 tabular", compact && "ml-auto")}>
        {compact ? minutesToTime(span.start) : `${range} · ${formatMinutes(span.end - span.start)}`}
      </span>
      {!compact && project && <ProjectMark name={project.name} color={project.color} size={14} className="absolute right-1.5 bottom-1.5 hidden group-hover:inline-flex" />}
      <span
        aria-hidden
        data-handle="resize"
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
      >
        <span className="mx-auto mt-0.5 block h-0.5 w-6 rounded-full bg-line-3" />
      </span>
    </button>
  )
}

/**
 * 今天的时间线：任务按开始时间摆成块，重叠的并排。
 * 鼠标拖动块改时间、拖下边改时长，从左边拖任务进来直接排上；点空白处选一件任务放进去。
 */
export function Timeline({ today, tasks, unscheduled, liveWindows }: { today: DayKey; tasks: Task[]; unscheduled: Task[]; liveWindows: LiveWindowRow[] }) {
  const profile = useWorkbench((state) => state.profile)
  const entries = useWorkbench((state) => state.entries)
  const timer = useWorkbench((state) => state.timer)
  const allTasks = useWorkbench((state) => state.tasks)
  const scheduleTask = useWorkbench((state) => state.scheduleTask)
  const updateTask = useWorkbench((state) => state.updateTask)
  const planTask = useWorkbench((state) => state.planTask)
  const openTask = useUi((state) => state.openTask)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const projectsById = useProjectsById()
  const now = useNow(30_000)
  const t = useT()

  const dayStart = profile.dayStartHour * 60
  const dayEnd = profile.dayEndHour * 60
  const rangeStartDate = parseDay(today)
  rangeStartDate.setHours(profile.dayStartHour, 0, 0, 0)
  const rangeEndDate = parseDay(today)
  rangeEndDate.setHours(profile.dayEndHour, 0, 0, 0)
  const rangeStart = rangeStartDate.getTime()
  const rangeEnd = rangeEndDate.getTime()
  const hours = Array.from({ length: profile.dayEndHour - profile.dayStartHour + 1 }, (_, i) => profile.dayStartHour + i)
  const isToday = todayKey(now) === today
  const nowMinute = minuteOfDay(now)
  const showNow = isToday && nowMinute >= dayStart && nowMinute <= dayEnd

  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const todayEntries = useMemo(
    () => entries.filter((entry) => dayKeyOf(new Date(entry.start)) === today),
    [entries, today]
  )
  const placed = useMemo(
    () =>
      layoutBlocks(
        blocksFor(tasks, today).map((block) => {
          // 时间线范围外的块贴边显示
          const start = Math.min(Math.max(block.start, dayStart), dayEnd - MIN_BLOCK)
          return { ...block, start, end: Math.min(dayEnd, Math.max(start + MIN_BLOCK, block.end - block.start + start)) }
        })
      ),
    [tasks, today, dayStart, dayEnd]
  )

  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<(Span & { taskId: string }) | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  // 打开时滚到「现在」前一小时附近
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const focus = showNow ? nowMinute - 60 : dayStart + 11 * 60
    element.scrollTop = Math.max(0, (focus - dayStart) * PX)
    // 只在第一次渲染时定位，之后不打扰用户自己的滚动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const minuteAt = (clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return dayStart
    return dayStart + (clientY - rect.top) / PX
  }

  const commit = (taskId: string, mode: "move" | "resize", span: Span) => {
    if (mode === "resize") updateTask(taskId, { estimateMin: span.end - span.start })
    else scheduleTask(taskId, minutesToTime(span.start))
  }

  const pointerDown = (block: PlacedBlock) => (event: PointerEvent<HTMLButtonElement>) => {
    // 手指在时间线上用来滚动，只有鼠标和笔可以拖
    if (event.pointerType === "touch" || event.button !== 0) return
    const handle = (event.target as HTMLElement).closest("[data-handle]")
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      taskId: block.taskId,
      mode: handle ? "resize" : "move",
      originY: event.clientY,
      start: block.start,
      end: block.end,
      moved: false,
    }
  }

  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current
    if (!state) return
    const dy = event.clientY - state.originY
    if (!state.moved && Math.abs(dy) < 4) return
    state.moved = true
    const next = adjust(state, state.mode, snap(dy / PX), dayStart, dayEnd)
    setPreview({ taskId: state.taskId, ...next })
  }

  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!state?.moved) return
    suppressClick.current = true
    const next = adjust(state, state.mode, snap((event.clientY - state.originY) / PX), dayStart, dayEnd)
    setPreview(null)
    if (next.start !== state.start || next.end !== state.end) commit(state.taskId, state.mode, next)
  }

  const keyDown = (block: PlacedBlock) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const delta = event.key === "ArrowUp" ? -SLOT_STEP : SLOT_STEP
    const mode = event.shiftKey ? "resize" : "move"
    commit(block.taskId, mode, adjust(block, mode, delta, dayStart, dayEnd))
  }

  const open = (taskId: string) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    openTask(taskId)
  }

  const onGridClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest("[data-block]") || target.closest("[data-actual-lane]")) return
    const minute = Math.floor(minuteAt(event.clientY) / SLOT_STEP) * SLOT_STEP
    setSlot(Math.min(dayEnd - SLOT_STEP, Math.max(dayStart, minute)))
  }

  const acceptsDrop = (event: DragEvent) => event.dataTransfer.types.includes(TASK_DRAG_TYPE)

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!acceptsDrop(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDropAt(Math.min(dayEnd - SLOT_STEP, Math.max(dayStart, snap(minuteAt(event.clientY)))))
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!acceptsDrop(event)) return
    event.preventDefault()
    const taskId = event.dataTransfer.getData(TASK_DRAG_TYPE)
    const minute = dropAt ?? snap(minuteAt(event.clientY))
    setDropAt(null)
    const task = allTasks.find((item) => item.id === taskId)
    if (!task) return
    if (task.plannedFor !== today) planTask(task.id, today)
    scheduleTask(task.id, minutesToTime(minute))
  }

  const place = (task: Task, minute: number) => {
    setSlot(null)
    if (task.plannedFor !== today) planTask(task.id, today)
    scheduleTask(task.id, minutesToTime(minute))
  }

  return (
    <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
      <div
        ref={gridRef}
        onClick={onGridClick}
        onDragOver={onDragOver}
        onDragLeave={() => setDropAt(null)}
        onDrop={onDrop}
        className="relative my-2 mr-1"
        style={{ height: (dayEnd - dayStart) * PX }}
      >
        {hours.map((hour) => (
          <div key={hour} aria-hidden className="pointer-events-none absolute right-0 left-0" style={{ top: (hour * 60 - dayStart) * PX }}>
            <span className="absolute left-2 w-8 -translate-y-1/2 text-right text-xs text-fg-2 tabular">{hour}:00</span>
            <span className="absolute right-0 left-[3.125rem] border-t border-line" />
            {hour < profile.dayEndHour && (
              <span className="absolute right-0 left-[3.125rem] border-t border-dashed border-line/70" style={{ top: HOUR_PX / 2 }} />
            )}
          </div>
        ))}

        <ActualLane
          entries={todayEntries}
          tasks={allTasks}
          windows={liveWindows}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          now={now}
          px={PX}
        />

        <div className="absolute inset-y-0 right-0 left-[3.125rem]">
          {placed.map((block) => {
            const task = byId.get(block.taskId)
            if (!task) return null
            const span = preview?.taskId === block.taskId ? preview : block
            return (
              <Block
                key={block.taskId}
                task={task}
                block={block}
                span={span}
                running={timer?.taskId === task.id}
                dayStart={dayStart}
                onPointerDown={pointerDown(block)}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onKeyDown={keyDown(block)}
                onOpen={() => open(task.id)}
              />
            )
          })}
        </div>

        {dropAt !== null && (
          <div aria-hidden className="pointer-events-none absolute right-0 left-[3.125rem] z-20" style={{ top: (dropAt - dayStart) * PX }}>
            <span className="block border-t-2 border-fg" />
            <span className="absolute -top-2.5 right-1 rounded-sm bg-fg px-1 text-xs text-white tabular">{minutesToTime(dropAt)}</span>
          </div>
        )}

        {showNow && (
          <div aria-hidden className="pointer-events-none absolute right-0 left-9 z-20 flex items-center" style={{ top: (nowMinute - dayStart) * PX }}>
            <span className="size-1.5 -translate-y-px rounded-full bg-risk" />
            <span className="h-px flex-1 bg-risk" />
          </div>
        )}

        {placed.length === 0 && (
          <p className="pointer-events-none absolute right-0 left-[3.125rem] top-1/2 -translate-y-1/2 text-center text-xs text-fg-2">
            {t.today.timeline.empty}
          </p>
        )}

        <Popover open={slot !== null} onOpenChange={(next) => !next && setSlot(null)}>
          <PopoverAnchor asChild>
            <span aria-hidden className="pointer-events-none absolute left-[3.25rem] h-0 w-0" style={{ top: ((slot ?? dayStart) - dayStart) * PX }} />
          </PopoverAnchor>
          <PopoverContent align="start" side="right" className="w-64 gap-0 p-1">
            <div className="px-2 pt-1 pb-1.5 text-xs text-fg-2 tabular">{slot !== null && t.today.timeline.slotStart(minutesToTime(slot))}</div>
            {unscheduled.slice(0, 6).map((task) => {
              const project = projectsById.get(task.projectId ?? "")
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => slot !== null && place(task, slot)}
                  className={cn("flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-hover", focusRingInset)}
                >
                  {project ? (
                    <ProjectMark name={project.name} color={project.color} size={14} />
                  ) : (
                    <span aria-hidden className="size-3.5 shrink-0 rounded-[4px] border border-line-3" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className="shrink-0 text-xs text-fg-2 tabular">{formatMinutes(task.estimateMin)}</span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                const minute = slot
                setSlot(null)
                if (minute !== null) openTaskForm({ mode: "create", preset: { plannedFor: today, startAt: minutesToTime(minute) } })
              }}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg-2 hover:bg-hover hover:text-fg",
                unscheduled.length > 0 && "mt-1 border-t border-line",
                focusRingInset
              )}
            >
              <Plus className="size-3.5" aria-hidden />
              {t.today.page.newTask}
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
