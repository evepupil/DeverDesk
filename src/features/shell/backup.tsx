"use client"

import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

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
import { parseBackup, toBackup } from "@/domain/backup"
import { todayKey } from "@/domain/calendar"
import type { WorkbenchData } from "@/domain/types"
import { useT } from "@/i18n/react"
import { useWorkbench, workbenchData } from "@/state/store"

/** 导出 / 导入备份：导出直接下载一个 JSON 文件；导入先确认，因为会替换现有数据 */
export function useBackupActions(): { exportBackup(): void; chooseFile(): void; node: ReactNode } {
  const t = useT()
  const importData = useWorkbench((state) => state.importData)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ data: WorkbenchData; name: string } | null>(null)

  const exportBackup = () => {
    const backup = toBackup(workbenchData(useWorkbench.getState()), Date.now())
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `workbench-${todayKey()}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(t.frame.backup.exported)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const result = parseBackup(await file.text())
    if (!result.ok) {
      toast.error(t.frame.backup.importFailed, { description: result.error })
      return
    }
    setPending({ data: result.data, name: file.name })
  }

  const node = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          void onFile(event.target.files?.[0])
          event.target.value = ""
        }}
      />
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.frame.backup.replaceTitle(pending?.name ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.frame.backup.replaceBody(pending?.data.tasks.length ?? 0, pending?.data.ledger.length ?? 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.words.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pending) return
                importData(pending.data)
                if (useWorkbench.getState().lastSaveOk) toast.success(t.frame.backup.imported)
              }}
            >
              {t.frame.backup.replace}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { exportBackup, chooseFile: () => inputRef.current?.click(), node }
}
