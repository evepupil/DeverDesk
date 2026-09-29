"use client"

import { Clock, Download, Keyboard, Upload, Wallet } from "lucide-react"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { WorkbenchMark } from "@/components/base/marks"
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut } from "@/components/ui/dropdown-menu"
import { PersistenceFeedback } from "@/features/shell/persistence-feedback"
import { ShellFrame } from "@/features/shell/shell-frame"
import { UserMenu } from "@/features/shell/user-menu"
import { useUi } from "@/state/ui"
import { useToday } from "@/state/hooks"
import { useWorkbench } from "@/state/store"
import { TaskSheet } from "../common/task-sheet"
import { EntryFormDialog } from "../forms/entry-form-dialog"
import { ProfileDialog } from "../forms/profile-dialog"
import { ProjectFormDialog } from "../forms/project-form-dialog"
import { RoutineFormDialog } from "../forms/routine-form-dialog"
import { TaskFormDialog } from "../forms/task-form-dialog"
import { useBackupActions } from "./backup"
import { WORKBENCH_PAGES } from "./nav"
import { QuickCapture } from "./quick-capture"
import { TimerChip } from "./timer-chip"
import { WorkbenchCommand } from "./workbench-command"
import { WorkbenchNotifications } from "./workbench-notifications"
import { WorkbenchSidebar } from "./workbench-sidebar"

function ProfileAvatar({ name }: { name: string }) {
  return (
    <span className="flex size-[22px] items-center justify-center rounded-full bg-fg text-xs font-medium text-white select-none">
      {name.slice(0, 1)}
    </span>
  )
}

/** 个人工作台的外框：通用骨架 + 自己的侧栏、搜索、提醒、计时条和浮层 */
export function WorkbenchShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const today = useToday()
  const profile = useWorkbench((state) => state.profile)
  const failures = useWorkbench((state) => state.saveFailures)
  const retrySave = useWorkbench((state) => state.retrySave)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const setProfileOpen = useUi((state) => state.setProfileOpen)
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen)
  const backup = useBackupActions()

  // 在「今天」页新建的任务默认排在今天
  const newTask = () => openTaskForm({ mode: "create", preset: pathname === "/" ? { plannedFor: today } : undefined })
  const newEntry = () => openEntryForm({ mode: "create" })

  return (
    <ShellFrame
      crumb={{ icon: <WorkbenchMark size={16} />, label: "我的工作台" }}
      sidebar={(onNavigate) => <WorkbenchSidebar onNavigate={onNavigate} />}
      windowBar={{
        searchLabel: "搜索任务、副业、收支",
        extras: <TimerChip />,
        notifications: <WorkbenchNotifications />,
        userMenu: (
          <UserMenu name={profile.name} avatar={<ProfileAvatar name={profile.name} />}>
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
              <Clock />
              可用时间
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={newEntry}>
              <Wallet />
              记一笔
              <DropdownMenuShortcut>M</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
              <Keyboard />
              键盘快捷键
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={backup.exportBackup}>
              <Download />
              导出备份
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={backup.chooseFile}>
              <Upload />
              导入备份
            </DropdownMenuItem>
          </UserMenu>
        ),
      }}
      overlays={
        <>
          <WorkbenchCommand />
          <TaskSheet />
          <TaskFormDialog />
          <EntryFormDialog />
          <RoutineFormDialog />
          <ProjectFormDialog />
          <ProfileDialog />
          <QuickCapture />
          {backup.node}
          <PersistenceFeedback id="workbench-save" failures={failures} retry={retrySave} />
        </>
      }
      shortcuts={{
        go: Object.fromEntries(WORKBENCH_PAGES.map((page) => [page.goKey, page.path])),
        keys: { c: newTask, m: newEntry },
        help: [
          { label: "新建任务", keys: ["C"] },
          { label: "记一笔", keys: ["M"] },
          ...WORKBENCH_PAGES.map((page) => ({ label: `前往${page.label}`, keys: ["G", page.goKey.toUpperCase()] })),
        ],
      }}
    >
      {children}
    </ShellFrame>
  )
}
