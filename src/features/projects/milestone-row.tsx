"use client"

import { cn } from "cn"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useEffect, useRef, useState, type Ref } from "react"
import { toast } from "sonner"

import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatMonthDay } from "@/domain/calendar"
import type { DayKey, Milestone } from "@/domain/types"
import { useT } from "@/i18n/react"
import { focusRingInset } from "@/lib/styles"
import { useWorkbench } from "@/state/store"
import { MilestoneEditor } from "./milestone-editor"
import { milestoneWhen } from "./project-card"

/** 「⋯」菜单：编辑，或者删除（删了会弹出带「撤销」的提示） */
function MilestoneMenu({
  projectId,
  milestone,
  onEdit,
  triggerRef,
}: {
  projectId: string
  milestone: Milestone
  onEdit(): void
  triggerRef: Ref<HTMLButtonElement>
}) {
  const t = useT()
  const removeMilestone = useWorkbench((state) => state.removeMilestone)
  const restoreMilestone = useWorkbench((state) => state.restoreMilestone)

  const remove = () => {
    removeMilestone(projectId, milestone.id)
    if (!useWorkbench.getState().lastSaveOk) return
    toast(t.projects.sheet.milestoneDeleted, {
      description: milestone.title,
      action: { label: t.common.undo, onClick: () => restoreMilestone(projectId, milestone) },
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon-xs"
          aria-label={t.projects.sheet.milestoneActions(milestone.title)}
          className="mr-1 text-fg-3 hover:text-fg"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          {t.words.edit}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={remove}>
          <Trash2 />
          {t.words.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 一条里程碑：整行点一下勾选或取消勾选，右侧「⋯」里改或删；改的时候这一行就地换成编辑框 */
export function MilestoneRow({ projectId, milestone, today }: { projectId: string; milestone: Milestone; today: DayKey }) {
  const t = useT()
  const toggleMilestone = useWorkbench((state) => state.toggleMilestone)
  const updateMilestone = useWorkbench((state) => state.updateMilestone)
  const [editing, setEditing] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  // 编辑结束后把焦点还给这一行的「⋯」，用键盘的人不会被甩回侧栏顶部
  useEffect(() => {
    if (editing || !returnFocus.current) return
    returnFocus.current = false
    menuRef.current?.focus()
  }, [editing])

  const finishEditing = () => {
    returnFocus.current = true
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="px-1">
        <MilestoneEditor
          milestone={milestone}
          onSave={(draft) => {
            if (draft.title !== milestone.title || draft.due !== milestone.due) updateMilestone(projectId, milestone.id, draft)
            finishEditing()
          }}
          onCancel={finishEditing}
        />
      </li>
    )
  }

  const when = milestone.doneOn ? null : milestoneWhen(milestone.due, today)
  return (
    <li className="flex items-center rounded-md hover:bg-hover">
      <button
        type="button"
        role="checkbox"
        aria-checked={milestone.doneOn !== null}
        onClick={() => toggleMilestone(projectId, milestone.id)}
        className={cn("flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-sm", focusRingInset)}
      >
        <StatusIcon glyph={milestone.doneOn ? "check" : "ring"} tone={milestone.doneOn ? "done" : "neutral"} />
        <span className={cn("min-w-0 flex-1 truncate", milestone.doneOn && "text-fg-2")} title={milestone.title}>
          {milestone.title}
        </span>
        <span className={cn("shrink-0 text-xs tabular", when?.late ? "text-bad" : "text-fg-2")}>
          {milestone.doneOn ? t.projects.sheet.milestoneDone(formatMonthDay(milestone.doneOn)) : `${formatMonthDay(milestone.due)} · ${when?.text}`}
        </span>
      </button>
      <MilestoneMenu projectId={projectId} milestone={milestone} onEdit={() => setEditing(true)} triggerRef={menuRef} />
    </li>
  )
}
