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
import { useT } from "@/i18n/react"
import { formatMonthDay } from "@/domain/calendar"
import { formatSignedAmount } from "@/domain/format"
import { searchLedger, searchProjects, searchTasks } from "@/domain/search"
import { taskCode } from "@/domain/tasks"
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
  const t = useT()

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
      title={t.shell.command.title}
      description={t.shell.command.description}
      className="top-[18%] sm:max-w-[560px]"
    >
      <Command shouldFilter={false} className="rounded-none p-0">
        <CommandInput placeholder={t.shell.command.placeholder} value={query} onValueChange={setQuery} />
        <CommandList className="scroll-thin max-h-[min(440px,60vh)] p-1">
          <CommandEmpty>{t.shell.command.noResults(q)}</CommandEmpty>

          {taskHits.length > 0 && (
            <CommandGroup heading={t.shell.command.tasks}>
              {taskHits.map((task) => {
                const status = TASK_STATUS[task.status]
                return (
                  <CommandItem key={task.id} value={`task-${task.id}`} onSelect={() => run(() => openTask(task.id))}>
                    <StatusIcon glyph={status.glyph} tone={status.tone} />
                    <span className="truncate">{task.title}</span>
                    <CommandShortcut className="tabular">{taskCode(task)}</CommandShortcut>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}

          {projectHits.length > 0 && (
            <CommandGroup heading={t.shell.command.projects}>
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
            <CommandGroup heading={t.shell.command.ledger}>
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
            <CommandGroup heading={t.shell.command.goTo}>
              {pageHits.map((page) => (
                <CommandItem key={page.key} value={`page-${page.key}`} onSelect={() => go(page.href)}>
                  {page.icon && <page.icon />}
                  <span className="truncate">{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!q && (
            <CommandGroup heading={t.shell.command.actions}>
              <CommandItem value="action-task" onSelect={() => run(() => openTaskForm({ mode: "create" }))}>
                <SquarePen />
                {t.shell.menu.newTask}
                <CommandShortcut>C</CommandShortcut>
              </CommandItem>
              <CommandItem value="action-entry" onSelect={() => run(() => openEntryForm({ mode: "create" }))}>
                <Wallet />
                {t.shell.menu.logEntry}
                <CommandShortcut>M</CommandShortcut>
              </CommandItem>
              <CommandItem value="action-profile" onSelect={() => run(() => setProfileOpen(true))}>
                <Clock />
                {t.shell.menu.availableTime}
              </CommandItem>
              <CommandItem value="action-shortcuts" onSelect={() => run(() => setShortcutsOpen(true))}>
                <Keyboard />
                {t.shell.menu.shortcuts}
                <CommandShortcut>?</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}

          {q && taskHits.length === 0 && (
            <CommandGroup heading={t.shell.command.actions}>
              <CommandItem
                value="action-create-from-query"
                onSelect={() => run(() => openTaskForm({ mode: "create", preset: { title: q } }))}
              >
                <Plus />
                <span className="truncate">{t.shell.command.createTask(q)}</span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
