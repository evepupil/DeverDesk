"use client"

import { Info, Keyboard, Plus, RotateCcw, SquarePen, Sparkles, Wallet } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DropdownMenuItem, DropdownMenuShortcut } from "@/components/ui/dropdown-menu"
import { isDone, isDueOn } from "@/domain/routines"
import { isOpen, isOverdue, isSlipped } from "@/domain/tasks"
import { pendingIncome } from "@/domain/ledger"
import { IS_LOCAL_EDITION } from "@/lib/edition"
import { useT } from "@/i18n/react"
import { NavRow, SectionTitle } from "@/features/shell/sidebar-parts"
import { BrandMenu } from "@/features/shell/brand-menu"
import { useUi } from "@/state/ui"
import { useToday } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { PriorityIcon } from "../common/task-bits"
import { WORKBENCH_PAGES, WORKBENCH_VIEWS, resolveWorkbenchNav, viewHref, type WorkbenchViewKey } from "./nav"

type Confirm = "fresh" | "sample" | null

/** 工作台侧栏：页面、各个副业、常用视图；只有当前入口有整行浅灰（提炼） */
export function WorkbenchSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const today = useToday()
  const tasks = useWorkbench((state) => state.tasks)
  const projects = useWorkbench((state) => state.projects)
  const routines = useWorkbench((state) => state.routines)
  const ledger = useWorkbench((state) => state.ledger)
  const meta = useWorkbench((state) => state.meta)
  const resetSample = useWorkbench((state) => state.resetSample)
  const startFresh = useWorkbench((state) => state.startFresh)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const openProjectForm = useUi((state) => state.openProjectForm)
  const openShortcuts = useUi((state) => state.setShortcutsOpen)
  const openLocalNotice = useUi((state) => state.setLocalNoticeOpen)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const t = useT()

  const active = resolveWorkbenchNav(pathname, new URLSearchParams(params.toString()))

  const counts = useMemo(() => {
    const planned = tasks.filter((task) => task.plannedFor === today && task.status !== "dropped")
    const dueRoutines = routines.filter((routine) => isDueOn(routine, today))
    const openByProject = new Map<string, number>()
    for (const task of tasks) {
      if (task.projectId && isOpen(task)) openByProject.set(task.projectId, (openByProject.get(task.projectId) ?? 0) + 1)
    }
    const views: Record<WorkbenchViewKey, number> = {
      overdue: tasks.filter((task) => isOverdue(task, today) || isSlipped(task, today)).length,
      urgent: tasks.filter((task) => (task.status === "todo" || task.status === "doing") && task.priority >= 3).length,
      pending: pendingIncome(ledger).length,
    }
    return {
      today: planned.length > 0 ? `${planned.filter((task) => task.status === "done").length}/${planned.length}` : undefined,
      routines: `${dueRoutines.filter((routine) => isDone(routine, today)).length}/${dueRoutines.length}`,
      openByProject,
      views,
    }
  }, [tasks, routines, ledger, today])

  const viewIcon: Record<WorkbenchViewKey, ReactNode> = {
    overdue: <StatusIcon glyph="alert" tone="risk" />,
    urgent: <PriorityIcon priority={3} />,
    pending: <StatusIcon glyph="half" tone="progress" />,
  }

  const visibleProjects = projects.filter((project) => project.stage !== "ended")

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-2">
        <BrandMenu>
          <DropdownMenuItem onSelect={() => openTaskForm({ mode: "create" })}>
            <SquarePen />
            {t.shell.menu.newTask}
            <DropdownMenuShortcut>C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openEntryForm({ mode: "create" })}>
            <Wallet />
            {t.shell.menu.logEntry}
            <DropdownMenuShortcut>M</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openShortcuts(true)}>
            <Keyboard />
            {t.shell.menu.shortcuts}
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
          {meta.sample ? (
            <DropdownMenuItem onSelect={() => setConfirm("fresh")}>
              <Sparkles />
              {t.shell.sidebar.startFresh}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("sample")}>
              <RotateCcw />
              {t.shell.sidebar.resetSample}
            </DropdownMenuItem>
          )}
          {IS_LOCAL_EDITION && (
            <DropdownMenuItem onSelect={() => openLocalNotice(true)}>
              <Info />
              {t.shell.sidebar.aboutLocal}
            </DropdownMenuItem>
          )}
        </BrandMenu>
        <IconButton label={t.shell.menu.newTask} shortcut="C" className="ml-auto" onClick={() => openTaskForm({ mode: "create" })}>
          <SquarePen />
        </IconButton>
      </div>

      <nav aria-label={t.shell.sidebar.mainNav} className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-px">
          {WORKBENCH_PAGES.map((page) => (
            <NavRow
              key={page.key}
              href={page.path}
              icon={<page.icon className="size-4" />}
              label={page.label}
              count={page.key === "today" ? counts.today : page.key === "routines" ? counts.routines : undefined}
              active={active === page.key}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <SectionTitle
          action={
            <IconButton label={t.shell.sidebar.newProject} size="icon-xs" onClick={() => openProjectForm(null)}>
              <Plus />
            </IconButton>
          }
        >
          {t.shell.sidebar.projects}
        </SectionTitle>
        <div className="flex flex-col gap-px">
          {visibleProjects.map((project) => (
            <NavRow
              key={project.id}
              href={`/projects?open=${project.id}`}
              icon={<ProjectMark name={project.name} color={project.color} size={16} />}
              label={project.name}
              count={counts.openByProject.get(project.id) || undefined}
              active={active === `project:${project.id}`}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <SectionTitle>{t.shell.sidebar.views}</SectionTitle>
        <div className="flex flex-col gap-px">
          {WORKBENCH_VIEWS.map((view) => (
            <NavRow
              key={view.key}
              href={viewHref(view)}
              icon={viewIcon[view.key]}
              label={view.label}
              count={counts.views[view.key]}
              active={active === view.key}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "fresh" ? t.shell.sidebar.startFreshTitle : t.shell.sidebar.resetSampleTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "fresh"
                ? t.shell.sidebar.startFreshDescription
                : t.shell.sidebar.resetSampleDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.words.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "sample" ? "destructive" : "default"}
              onClick={() => {
                if (confirm === "fresh") {
                  startFresh()
                  toast.success(t.shell.sidebar.startedFresh)
                } else {
                  resetSample()
                  toast.success(t.shell.sidebar.resetSampleDone)
                }
              }}
            >
              {confirm === "fresh" ? t.shell.sidebar.startFreshAction : t.shell.sidebar.resetSampleAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
