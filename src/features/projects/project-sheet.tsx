"use client"

import { cn } from "cn"
import { Pencil, Plus } from "lucide-react"
import Link from "next/link"
import { useMemo, useState, type FormEvent } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectItem } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ENTRY_STATUS, PROJECT_STAGE, PROJECT_STAGE_ORDER } from "@/data/catalog"
import { addDays, formatDayShort, formatMonthDay } from "@/domain/calendar"
import { formatAmount, formatHours, formatSignedAmount } from "@/domain/format"
import { summarizeProject } from "@/domain/projects"
import { isOpen, sortTasks } from "@/domain/tasks"
import type { ProjectStage } from "@/domain/types"
import { validateTitle } from "@/domain/validation"
import { focusRing, focusRingInset } from "@/lib/styles"
import { useToday, useWorkbenchData } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { LabeledBars } from "../common/bars"
import { PropertySelect } from "../common/property-controls"
import { QuickAdd } from "../common/quick-add"
import { SheetProperty, SheetSection } from "../common/sheet-parts"
import { TaskRow } from "../common/task-row"
import { milestoneWhen } from "./project-card"

function Figure({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-raised px-2.5 py-2">
      <span className="truncate text-xs text-fg-2">{label}</span>
      <span className={cn("truncate text-sm font-medium tabular", tone === "bad" && "text-bad")}>{value}</span>
    </div>
  )
}

function MilestoneForm({ projectId, today }: { projectId: string; today: string }) {
  const addMilestone = useWorkbench((state) => state.addMilestone)
  const [title, setTitle] = useState("")
  const [due, setDue] = useState(addDays(today, 14))
  const [error, setError] = useState<string>()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateTitle(title, "里程碑", 40)
    setError(found)
    if (found || !due) return
    addMilestone(projectId, title, due)
    setTitle("")
  }

  return (
    <form onSubmit={submit} noValidate className="mt-1 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Plus className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (error) setError(undefined)
          }}
          placeholder="添加里程碑，回车确认"
          aria-label="新里程碑"
          aria-invalid={error ? true : undefined}
          className="h-7 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-3 md:text-sm"
        />
        <Input type="date" aria-label="目标日期" value={due} onChange={(event) => setDue(event.target.value)} className="h-7 w-[8.5rem]" />
      </div>
      {error && (
        <p role="alert" className="pl-[22px] text-xs text-bad">
          {error}
        </p>
      )}
    </form>
  )
}

/** 副业详情：阶段、本月数字、最近 12 周走势、里程碑、待办和最近的收支 */
export function ProjectSheet({ projectId, onClose }: { projectId: string | null; onClose(): void }) {
  const data = useWorkbenchData()
  const today = useToday()
  const saveProject = useWorkbench((state) => state.saveProject)
  const toggleMilestone = useWorkbench((state) => state.toggleMilestone)
  const openProjectForm = useUi((state) => state.openProjectForm)
  const openEntryForm = useUi((state) => state.openEntryForm)

  const project = projectId ? data.projects.find((item) => item.id === projectId) : undefined
  const summary = useMemo(() => (project ? summarizeProject(data, project, today) : null), [data, project, today])
  const openTasks = useMemo(
    () => (project ? sortTasks(data.tasks.filter((task) => task.projectId === project.id && isOpen(task)), "priority") : []),
    [data.tasks, project]
  )
  const recent = useMemo(
    () =>
      project
        ? data.ledger
            .filter((entry) => entry.projectId === project.id)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 6)
        : [],
    [data.ledger, project]
  )

  return (
    <Sheet open={projectId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[520px]">
        {!project || !summary ? (
          <>
            <SheetTitle className="sr-only">副业详情</SheetTitle>
            <EmptyState title="没有找到这个副业" className="flex-1" />
          </>
        ) : (
          <>
            <SheetHeader className="gap-2 pr-11">
              <div className="flex items-center gap-1.5 text-xs text-fg-2">
                <span>{formatMonthDay(project.startedOn)}开始</span>
                {summary.lastActive && (
                  <>
                    <span aria-hidden>·</span>
                    <span>最近活动 {formatMonthDay(summary.lastActive)}</span>
                  </>
                )}
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => openProjectForm(project.id)}>
                  <Pencil />
                  编辑
                </Button>
              </div>
              <SheetTitle className="flex items-center gap-2 text-sm font-medium">
                <ProjectMark name={project.name} color={project.color} size={20} />
                <span className="min-w-0 break-words">{project.name}</span>
              </SheetTitle>
              <SheetDescription className={cn("text-sm", project.goal ? "text-fg-2" : "sr-only")}>
                {project.goal || "副业详情"}
              </SheetDescription>
            </SheetHeader>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 px-4 pb-3">
                <SheetProperty label="阶段" htmlFor="project-sheet-stage">
                  <PropertySelect
                    id="project-sheet-stage"
                    value={project.stage}
                    onChange={(stage) =>
                      saveProject(
                        { name: project.name, color: project.color, goal: project.goal, monthlyTarget: project.monthlyTarget, stage: stage as ProjectStage },
                        project.id
                      )
                    }
                  >
                    {PROJECT_STAGE_ORDER.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        <StatusIcon glyph={PROJECT_STAGE[stage].glyph} tone={PROJECT_STAGE[stage].tone} />
                        {PROJECT_STAGE[stage].label}
                      </SelectItem>
                    ))}
                  </PropertySelect>
                </SheetProperty>
                <SheetProperty label="月目标">
                  <span className="px-2 text-sm tabular">{project.monthlyTarget ? formatAmount(project.monthlyTarget) : "—"}</span>
                </SheetProperty>
              </dl>

              <SheetSection title="本月">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  <Figure label="净收入" value={formatAmount(summary.month.net)} tone={summary.month.net < 0 ? "bad" : undefined} />
                  <Figure label="投入" value={formatHours(summary.month.minutes)} />
                  <Figure label="时薪" value={summary.month.minutes > 0 ? formatAmount(Math.round(summary.month.rate)) : "—"} />
                  <Figure label="累计净收入" value={formatAmount(summary.totalNet)} tone={summary.totalNet < 0 ? "bad" : undefined} />
                </div>
              </SheetSection>

              <SheetSection
                title="最近 12 周净收入"
                aside={
                  <span className="text-xs text-fg-2 tabular">
                    {formatAmount(summary.weeks.reduce((sum, week) => sum + week.net, 0))}
                  </span>
                }
              >
                <LabeledBars
                  data={summary.weeks.map((week) => ({
                    key: week.start,
                    label: formatDayShort(week.start),
                    value: week.net,
                    title: `${formatMonthDay(week.start)} 那周：净收入 ${formatAmount(week.net)}，投入 ${formatHours(week.minutes)}`,
                  }))}
                />
              </SheetSection>

              <SheetSection
                title="里程碑"
                aside={
                  project.milestones.length > 0 ? (
                    <span className="text-xs text-fg-2 tabular">
                      {summary.milestonesDone}/{project.milestones.length}
                    </span>
                  ) : undefined
                }
              >
                <ul className="-mx-1 flex flex-col">
                  {project.milestones.map((milestone) => {
                    const when = milestone.doneOn ? null : milestoneWhen(milestone.due, today)
                    return (
                      <li key={milestone.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={milestone.doneOn !== null}
                          onClick={() => toggleMilestone(project.id, milestone.id)}
                          className={cn("flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left text-sm hover:bg-hover", focusRingInset)}
                        >
                          <StatusIcon glyph={milestone.doneOn ? "check" : "ring"} tone={milestone.doneOn ? "done" : "neutral"} />
                          <span className={cn("min-w-0 flex-1 truncate", milestone.doneOn && "text-fg-2")}>{milestone.title}</span>
                          <span className={cn("shrink-0 text-xs tabular", when?.late ? "text-bad" : "text-fg-2")}>
                            {milestone.doneOn ? `${formatMonthDay(milestone.doneOn)}达成` : `${formatMonthDay(milestone.due)} · ${when?.text}`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <MilestoneForm projectId={project.id} today={today} />
              </SheetSection>

              <SheetSection
                title="待办"
                aside={
                  openTasks.length > 0 ? (
                    <Link href={`/tasks?project=${project.id}`} className={cn("text-xs text-fg-2 hover:text-fg", focusRing)}>
                      全部 {openTasks.length} 件
                    </Link>
                  ) : undefined
                }
              >
                <div className="-mx-4 border-t border-line">
                  {openTasks.slice(0, 8).map((task) => (
                    <TaskRow key={task.id} task={task} today={today} showId={false} showProject={false} className="px-4" />
                  ))}
                  <QuickAdd defaultDay={null} defaultProjectId={project.id} today={today} placeholder={`给「${project.name}」加一件事`} className="px-1" />
                </div>
              </SheetSection>

              <SheetSection
                title="最近收支"
                aside={
                  <Link href={`/ledger?project=${project.id}`} className={cn("text-xs text-fg-2 hover:text-fg", focusRing)}>
                    全部
                  </Link>
                }
              >
                {recent.length === 0 ? (
                  <p className="text-sm text-fg-2">还没有收支记录</p>
                ) : (
                  <ul className="-mx-1 flex flex-col">
                    {recent.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => openEntryForm({ mode: "edit", entryId: entry.id })}
                          className={cn("flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left text-sm hover:bg-hover", focusRingInset)}
                        >
                          <StatusIcon glyph={ENTRY_STATUS[entry.status].glyph} tone={ENTRY_STATUS[entry.status].tone} label={ENTRY_STATUS[entry.status].label} />
                          <span className="w-10 shrink-0 text-xs text-fg-2 tabular">{formatDayShort(entry.date)}</span>
                          <span className="min-w-0 flex-1 truncate">{entry.note}</span>
                          <span className={cn("shrink-0 tabular", entry.kind === "expense" && "text-fg-2")}>
                            {formatSignedAmount(entry.kind === "income" ? entry.amount : -entry.amount)}
                          </span>
                        </button>
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
