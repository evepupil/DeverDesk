"use client"

import { Clock, Keyboard, Plus, SquarePen, Wallet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { ENTRY_STATUS, PROJECT_STAGE, TASK_STATUS } from "@/data/catalog"
import { formatMonthDay } from "@/domain/calendar"
import { formatSignedAmount } from "@/domain/format"
import { searchLedger, searchProjects, searchTasks } from "@/domain/search"
import { useUi } from "@/state/ui"
import { useWorkbench } from "@/state/store"
import { WORKBENCH_PAGES, WORKBENCH_VIEWS, viewHref } from "./nav"

/** 工作台的全局搜索：任务、副业、收支、页面和常用操作 */
export function WorkbenchCommand() {
  const router = useRouter()
  const open = useUi((state) => state.commandOpen)
  const setOpen = useUi((state) => state.setCommandOpen)
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen)
  const tasks = useWorkbench((state) => state.tasks)
  const projects = useWorkbench((state) => state.projects)
  const ledger = useWorkbench((state) => state.ledger)
  const openTask = useUi((state) => state.openTask)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const setProfileOpen = useUi((state) => state.setProfileOpen)
  const [query, setQuery] = useState("")

  const q = query.trim()
  const taskHits = useMemo(() => searchTasks(tasks, q), [tasks, q])
  const projectHits = useMemo(() => searchProjects(projects, q), [projects, q])
  const entryHits = useMemo(() => searchLedger(ledger, q), [ledger, q])
  const pages = [
    ...WORKBENCH_PAGES.map((page) => ({ key: page.key, label: page.label, href: page.path, icon: page.icon })),
    ...WORKBENCH_VIEWS.map((view) => ({ key: view.key, label: view.label, href: viewHref(view), icon: null })),
  ]
  const pageHits = q ? pages.filter((page) => page.label.includes(q)) : pages

  const close = () => {
    setOpen(false)
    setQuery("")
  }
  const go = (href: string) => {
    close()
    router.push(href)
  }
  const run = (action: () => void) => {
    close()
    action()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
      title="搜索"
      description="搜索任务、副业、收支或跳转页面"
      className="top-[18%] sm:max-w-[560px]"
    >
      <Command shouldFilter={false} className="rounded-none p-0">
        <CommandInput placeholder="搜索任务、副业、收支说明或金额" value={query} onValueChange={setQuery} />
        <CommandList className="scroll-thin max-h-[min(440px,60vh)] p-1">
          <CommandEmpty>没有找到“{q}”</CommandEmpty>

          {taskHits.length > 0 && (
            <CommandGroup heading="任务">
              {taskHits.map((task) => {
                const status = TASK_STATUS[task.status]
                return (
                  <CommandItem key={task.id} value={`task-${task.id}`} onSelect={() => run(() => openTask(task.id))}>
                    <StatusIcon glyph={status.glyph} tone={status.tone} />
                    <span className="truncate">{task.title}</span>
                    <CommandShortcut className="tabular">{task.id}</CommandShortcut>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}

          {projectHits.length > 0 && (
            <CommandGroup heading="副业">
              {projectHits.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`project-${project.id}`}
                  onSelect={() => go(`/projects?open=${project.id}`)}
                >
                  <ProjectMark name={project.name} color={project.color} size={16} />
                  <span className="truncate">{project.name}</span>
                  <CommandShortcut>{PROJECT_STAGE[project.stage].label}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {entryHits.length > 0 && (
            <CommandGroup heading="收支">
              {entryHits.map((entry) => {
                const status = ENTRY_STATUS[entry.status]
                return (
                  <CommandItem
                    key={entry.id}
                    value={`entry-${entry.id}`}
                    onSelect={() => run(() => openEntryForm({ mode: "edit", entryId: entry.id }))}
                  >
                    <StatusIcon glyph={status.glyph} tone={status.tone} />
                    <span className="shrink-0 text-fg-2 tabular">{formatMonthDay(entry.date)}</span>
                    <span className="truncate">{entry.note}</span>
                    <CommandShortcut className="tabular">
                      {formatSignedAmount(entry.kind === "income" ? entry.amount : -entry.amount)}
                    </CommandShortcut>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}

          {pageHits.length > 0 && (
            <CommandGroup heading="跳转">
              {pageHits.map((page) => (
                <CommandItem key={page.key} value={`page-${page.key}`} onSelect={() => go(page.href)}>
                  {page.icon && <page.icon />}
                  <span className="truncate">{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!q && (
            <CommandGroup heading="操作">
              <CommandItem value="action-task" onSelect={() => run(() => openTaskForm({ mode: "create" }))}>
                <SquarePen />
                新建任务
                <CommandShortcut>C</CommandShortcut>
              </CommandItem>
              <CommandItem value="action-entry" onSelect={() => run(() => openEntryForm({ mode: "create" }))}>
                <Wallet />
                记一笔
                <CommandShortcut>M</CommandShortcut>
              </CommandItem>
              <CommandItem value="action-profile" onSelect={() => run(() => setProfileOpen(true))}>
                <Clock />
                可用时间
              </CommandItem>
              <CommandItem value="action-shortcuts" onSelect={() => run(() => setShortcutsOpen(true))}>
                <Keyboard />
                键盘快捷键
                <CommandShortcut>?</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}

          {q && taskHits.length === 0 && (
            <CommandGroup heading="操作">
              <CommandItem
                value="action-create-from-query"
                onSelect={() => run(() => openTaskForm({ mode: "create", preset: { title: q } }))}
              >
                <Plus />
                <span className="truncate">新建任务「{q}」</span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
