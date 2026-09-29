"use client"

import { cn } from "cn"
import { Clock3, Pencil, Play, Plus, Square, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { dayKeyOf, formatDayLong, formatMonthDay, minutesToTime, minuteOfDay } from "@/domain/calendar"
import { formatClock, formatMinutes, formatMinutesLong } from "@/domain/format"
import { minutesOf } from "@/domain/tasks"
import type { Priority, TaskStatus } from "@/domain/types"
import { focusRing } from "@/lib/styles"
import { useNow, useToday } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { EstimateOptions, NO_PROJECT, PriorityOptions, ProjectOptions, PropertySelect, StatusOptions } from "./property-controls"
import { SheetProperty, SheetSection } from "./sheet-parts"
import { StatusToggle } from "./task-bits"
import { TaskMenu } from "./task-menu"

function RunningClock({ startedAt }: { startedAt: number }) {
  const now = useNow(1000)
  return <span className="tabular">{formatClock(now - startedAt)}</span>
}

/** 任务详情侧栏：属性可以直接改，另有备注、子任务和投入记录 */
export function TaskSheet() {
  const taskId = useUi((state) => state.taskSheetId)
  const close = useUi((state) => state.closeTask)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const tasks = useWorkbench((state) => state.tasks)
  const projects = useWorkbench((state) => state.projects)
  const entries = useWorkbench((state) => state.entries)
  const timer = useWorkbench((state) => state.timer)
  const updateTask = useWorkbench((state) => state.updateTask)
  const setStatus = useWorkbench((state) => state.setTaskStatus)
  const startTimer = useWorkbench((state) => state.startTimer)
  const stopTimer = useWorkbench((state) => state.stopTimer)
  const logTime = useWorkbench((state) => state.logTime)
  const addSubtask = useWorkbench((state) => state.addSubtask)
  const toggleSubtask = useWorkbench((state) => state.toggleSubtask)
  const removeSubtask = useWorkbench((state) => state.removeSubtask)
  const today = useToday()
  const [subtask, setSubtask] = useState("")

  const task = taskId ? tasks.find((item) => item.id === taskId) : undefined
  const taskEntries = useMemo(
    () => (task ? entries.filter((entry) => entry.taskId === task.id).sort((a, b) => b.start - a.start) : []),
    [entries, task]
  )
  const logged = taskEntries.reduce((sum, entry) => sum + minutesOf(entry), 0)
  const running = timer?.taskId === task?.id

  return (
    <Sheet open={taskId !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[460px]">
        {!task ? (
          <>
            <SheetTitle className="sr-only">任务详情</SheetTitle>
            <EmptyState title="这个任务已经删除" className="flex-1" />
          </>
        ) : (
          <>
            <SheetHeader className="gap-2 pr-11">
              <div className="flex items-center gap-1.5 text-xs text-fg-2">
                <span className="tabular">{task.id}</span>
                <span aria-hidden>·</span>
                <span>{formatMonthDay(dayKeyOf(new Date(task.createdAt)))}创建</span>
                <div className="ml-auto flex items-center gap-1">
                  {task.status !== "done" && task.status !== "dropped" && (
                    <Button
                      variant={running ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => (running ? stopTimer() : startTimer(task.id))}
                      className={cn(running && "text-warn")}
                    >
                      {running ? <Square className="fill-current" /> : <Play />}
                      {running && timer ? <RunningClock startedAt={timer.startedAt} /> : "开始计时"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openTaskForm({ mode: "edit", taskId: task.id })}>
                    <Pencil />
                    编辑
                  </Button>
                  <TaskMenu task={task} today={today} />
                </div>
              </div>
              <SheetTitle className="flex items-start gap-1.5 text-sm font-medium">
                <StatusToggle task={task} className="mt-[-1.5px]" />
                <span className="min-w-0 break-words">{task.title}</span>
              </SheetTitle>
              <SheetDescription className="sr-only">任务详情</SheetDescription>
            </SheetHeader>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 px-4 pb-3">
                <SheetProperty label="状态" htmlFor="task-status">
                  <PropertySelect id="task-status" value={task.status} onChange={(value) => setStatus(task.id, value as TaskStatus)}>
                    <StatusOptions />
                  </PropertySelect>
                </SheetProperty>
                <SheetProperty label="副业" htmlFor="task-project">
                  <PropertySelect
                    id="task-project"
                    value={task.projectId ?? NO_PROJECT}
                    onChange={(value) => updateTask(task.id, { projectId: value === NO_PROJECT ? null : value })}
                  >
                    <ProjectOptions projects={projects} />
                  </PropertySelect>
                </SheetProperty>
                <SheetProperty label="优先级" htmlFor="task-priority">
                  <PropertySelect
                    id="task-priority"
                    value={String(task.priority)}
                    onChange={(value) => updateTask(task.id, { priority: Number(value) as Priority })}
                  >
                    <PriorityOptions />
                  </PropertySelect>
                </SheetProperty>
                <SheetProperty label="计划" htmlFor="task-plan">
                  <div className="flex w-full items-center gap-1.5">
                    <Input
                      id="task-plan"
                      type="date"
                      value={task.plannedFor ?? ""}
                      onChange={(event) => updateTask(task.id, { plannedFor: event.target.value || null })}
                      className="h-7 flex-1"
                    />
                    <Input
                      aria-label="开始时间"
                      type="time"
                      step={900}
                      value={task.startAt ?? ""}
                      disabled={!task.plannedFor}
                      onChange={(event) => updateTask(task.id, { startAt: event.target.value || null })}
                      className="h-7 w-[6.5rem]"
                    />
                  </div>
                </SheetProperty>
                <SheetProperty label="预估" htmlFor="task-estimate">
                  <PropertySelect
                    id="task-estimate"
                    value={String(task.estimateMin)}
                    onChange={(value) => updateTask(task.id, { estimateMin: Number(value) })}
                  >
                    <EstimateOptions current={task.estimateMin} />
                  </PropertySelect>
                </SheetProperty>
                <SheetProperty label="截止" htmlFor="task-due">
                  <Input
                    id="task-due"
                    type="date"
                    value={task.dueOn ?? ""}
                    onChange={(event) => updateTask(task.id, { dueOn: event.target.value || null })}
                    className="h-7"
                  />
                </SheetProperty>
                <SheetProperty label="已投入">
                  <div className="flex w-full items-center justify-between gap-2 px-2">
                    <span className={cn("text-sm tabular", logged > task.estimateMin ? "text-warn" : "text-fg")}>
                      {formatMinutesLong(logged)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Clock3 />
                          补记
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        {[15, 30, 60, 90, 120].map((minutes) => (
                          <DropdownMenuItem
                            key={minutes}
                            onSelect={() => {
                              logTime(task.id, minutes)
                              if (useWorkbench.getState().lastSaveOk) toast.success(`已补记 ${formatMinutesLong(minutes)}`)
                            }}
                          >
                            {formatMinutesLong(minutes)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </SheetProperty>
              </dl>

              <SheetSection title="备注">
                <Textarea
                  key={task.id}
                  defaultValue={task.notes}
                  placeholder="写点背景、链接或下一步"
                  onBlur={(event) => {
                    if (event.target.value !== task.notes) updateTask(task.id, { notes: event.target.value })
                  }}
                  className="min-h-16"
                />
              </SheetSection>

              <SheetSection
                title="子任务"
                aside={
                  task.subtasks.length > 0 ? (
                    <span className="text-xs text-fg-2 tabular">
                      {task.subtasks.filter((sub) => sub.done).length}/{task.subtasks.length}
                    </span>
                  ) : undefined
                }
              >
                <ul className="-mx-1 flex flex-col">
                  {task.subtasks.map((sub) => (
                    <li key={sub.id} className="group flex h-8 items-center gap-2 rounded-md px-1 hover:bg-hover">
                      <input
                        type="checkbox"
                        checked={sub.done}
                        onChange={() => toggleSubtask(task.id, sub.id)}
                        aria-label={sub.title}
                        className="size-3.5 accent-[var(--done)]"
                      />
                      <span className={cn("min-w-0 flex-1 truncate text-sm", sub.done && "text-fg-2 line-through decoration-fg-3")}>
                        {sub.title}
                      </span>
                      <button
                        type="button"
                        aria-label={`删除子任务：${sub.title}`}
                        onClick={() => removeSubtask(task.id, sub.id)}
                        className={cn("rounded p-0.5 text-fg-3 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100", focusRing)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <form
                  className="mt-1 flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!subtask.trim()) return
                    addSubtask(task.id, subtask)
                    setSubtask("")
                  }}
                >
                  <Plus className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                  <input
                    value={subtask}
                    onChange={(event) => setSubtask(event.target.value)}
                    placeholder="添加子任务，回车确认"
                    aria-label="添加子任务"
                    className="h-7 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-3 md:text-sm"
                  />
                </form>
              </SheetSection>

              <SheetSection title="投入记录" aside={taskEntries.length > 0 ? <span className="text-xs text-fg-2 tabular">{taskEntries.length} 段</span> : undefined}>
                {taskEntries.length === 0 && !running ? (
                  <p className="text-sm text-fg-2">还没有记录，开始计时或补记一段</p>
                ) : (
                  <ul className="flex flex-col">
                    {running && timer && (
                      <li className="flex h-7 items-center gap-2 text-sm text-warn">
                        <span className="w-24 shrink-0">正在计时</span>
                        <span className="text-xs tabular">{minutesToTime(minuteOfDay(timer.startedAt))} 开始</span>
                        <span className="ml-auto">
                          <RunningClock startedAt={timer.startedAt} />
                        </span>
                      </li>
                    )}
                    {taskEntries.slice(0, 12).map((entry) => (
                      <li key={entry.id} className="flex h-7 items-center gap-2 text-sm">
                        <span className="w-24 shrink-0 text-fg-2">{formatDayLong(dayKeyOf(new Date(entry.start)))}</span>
                        <span className="text-xs text-fg-2 tabular">
                          {minutesToTime(minuteOfDay(entry.start))}–{minutesToTime(minuteOfDay(entry.end))}
                        </span>
                        <span className="ml-auto tabular">{formatMinutes(minutesOf(entry))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SheetSection>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
