"use client"

import { Clock, Download, Keyboard, KeyRound, LogOut, Upload, Wallet } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { WorkbenchMark } from "@/components/base/marks"
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
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut } from "@/components/ui/dropdown-menu"
import { LocalNotice } from "@/features/edition/local-notice"
import { RepoLink } from "@/features/edition/repo-link"
import { TokensDialog } from "@/features/auth/tokens-dialog"
import { SyncIndicator } from "@/features/sync/sync-indicator"
import { PersistenceFeedback } from "@/features/shell/persistence-feedback"
import { ShellFrame } from "@/features/shell/shell-frame"
import { UserMenu } from "@/features/shell/user-menu"
import { ApiFailure, logout } from "@/lib/api"
import { useT } from "@/i18n/react"
import { EDITION, IS_LOCAL_EDITION } from "@/lib/edition"
import { clearLocalData, stopSync, useSync } from "@/state/sync"
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
import { LanguageMenu } from "./language-menu"
import { usePageTitle } from "./page-title"
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
  const setTokensOpen = useUi((state) => state.setTokensOpen)
  const backup = useBackupActions()
  const isCloud = EDITION === "cloud"
  const pendingCount = useSync((state) => state.pending)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  usePageTitle(pathname)
  const t = useT()

  // 在「今天」页新建的任务默认排在今天
  const newTask = () => openTaskForm({ mode: "create", preset: pathname === "/" ? { plannedFor: today } : undefined })
  const newEntry = () => openEntryForm({ mode: "create" })

  const doSignOut = async () => {
    try {
      await logout()
    } catch (cause) {
      // 登录凭证只有服务器能清掉：断网时退出，联网后会自动登录回来，所以先不退
      if (cause instanceof ApiFailure && cause.kind === "network") {
        toast.error(t.shell.workbench.offlineSignOut)
        return
      }
    }
    stopSync()
    clearLocalData()
    window.location.reload()
  }

  // 退出登录前：还有没传完的改动先确认
  const requestSignOut = () => {
    if (useSync.getState().pending > 0) {
      setConfirmSignOut(true)
      return
    }
    void doSignOut()
  }

  return (
    <ShellFrame
      crumb={{ icon: <WorkbenchMark size={16} />, label: t.shell.workbench.workspace }}
      sidebar={(onNavigate) => <WorkbenchSidebar onNavigate={onNavigate} />}
      windowBar={{
        searchLabel: t.shell.workbench.search,
        extras: (
          <>
            <TimerChip />
            {isCloud && <SyncIndicator />}
            {IS_LOCAL_EDITION && <RepoLink />}
          </>
        ),
        notifications: <WorkbenchNotifications />,
        userMenu: (
          <UserMenu name={profile.name} avatar={<ProfileAvatar name={profile.name} />}>
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
              <Clock />
              {t.shell.menu.availableTime}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={newEntry}>
              <Wallet />
              {t.shell.menu.logEntry}
              <DropdownMenuShortcut>M</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
              <Keyboard />
              {t.shell.menu.shortcuts}
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <LanguageMenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={backup.exportBackup}>
              <Download />
              {t.shell.workbench.exportBackup}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={backup.chooseFile}>
              <Upload />
              {t.shell.workbench.importBackup}
            </DropdownMenuItem>
            {isCloud && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTokensOpen(true)}>
                  <KeyRound />
                  {t.shell.workbench.tokens}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={requestSignOut}>
                  <LogOut />
                  {t.shell.workbench.signOut}
                </DropdownMenuItem>
              </>
            )}
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
          {isCloud && <TokensDialog />}
          {IS_LOCAL_EDITION && <LocalNotice />}
          {backup.node}
          {isCloud && (
            <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t.shell.workbench.signOutTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t.shell.workbench.signOutPending(pendingCount)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.words.cancel}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void doSignOut()}>
                    {t.shell.workbench.signOutAnyway}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <PersistenceFeedback id="workbench-save" failures={failures} retry={retrySave} />
        </>
      }
      shortcuts={{
        go: Object.fromEntries(WORKBENCH_PAGES.map((page) => [page.goKey, page.path])),
        keys: { c: newTask, m: newEntry },
        help: [
          { label: t.shell.menu.newTask, keys: ["C"] },
          { label: t.shell.menu.logEntry, keys: ["M"] },
          ...WORKBENCH_PAGES.map((page) => ({ label: t.shell.workbench.goTo(page.label), keys: ["G", page.goKey.toUpperCase()] })),
        ],
      }}
    >
      {children}
    </ShellFrame>
  )
}
