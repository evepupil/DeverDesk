"use client"

import { Keyboard, Plus, RotateCcw, SquarePen, Sparkles, Wallet } from "lucide-react"
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
  const [confirm, setConfirm] = useState<Confirm>(null)

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
            新建任务
            <DropdownMenuShortcut>C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openEntryForm({ mode: "create" })}>
            <Wallet />
            记一笔
            <DropdownMenuShortcut>M</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openShortcuts(true)}>
            <Keyboard />
            键盘快捷键
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
          {meta.sample ? (
            <DropdownMenuItem onSelect={() => setConfirm("fresh")}>
              <Sparkles />
              清空样例，开始自己用
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("sample")}>
              <RotateCcw />
              换回样例数据
            </DropdownMenuItem>
          )}
        </BrandMenu>
        <IconButton label="新建任务" shortcut="C" className="ml-auto" onClick={() => openTaskForm({ mode: "create" })}>
          <SquarePen />
        </IconButton>
      </div>

      <nav aria-label="主导航" className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
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
            <IconButton label="新的副业" size="icon-xs" onClick={() => openProjectForm(null)}>
              <Plus />
            </IconButton>
          }
        >
          副业
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

        <SectionTitle>视图</SectionTitle>
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
            <AlertDialogTitle>{confirm === "fresh" ? "清空样例，开始自己用？" : "换回样例数据？"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "fresh"
                ? "任务、投入记录、收支和回顾会清空；副业清单、例行事务和可用时间会保留，方便直接改成你自己的。"
                : "你自己记的内容会被样例数据替换，不能恢复。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "sample" ? "destructive" : "default"}
              onClick={() => {
                if (confirm === "fresh") {
                  startFresh()
                  toast.success("已清空，从今天开始记")
                } else {
                  resetSample()
                  toast.success("已换回样例数据")
                }
              }}
            >
              {confirm === "fresh" ? "清空" : "换回"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
