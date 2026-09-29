"use client"

import { cn } from "cn"
import { CircleCheck, MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { LabelChip } from "@/components/base/label-chip"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CHANNELS, ENTRY_STATUS, categoryLabel } from "@/data/catalog"
import { diffDays, formatDayShort, weekdayLabel } from "@/domain/calendar"
import { formatAmount, formatSignedAmount } from "@/domain/format"
import type { DayKey, LedgerEntry, Project } from "@/domain/types"
import { focusRing } from "@/lib/styles"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"

function EntryMenu({ entry }: { entry: LedgerEntry }) {
  const setEntryStatus = useWorkbench((state) => state.setEntryStatus)
  const deleteEntry = useWorkbench((state) => state.deleteEntry)
  const restoreEntry = useWorkbench((state) => state.restoreEntry)
  const openEntryForm = useUi((state) => state.openEntryForm)

  const setStatus = (status: LedgerEntry["status"], message: string) => {
    setEntryStatus(entry.id, status)
    if (useWorkbench.getState().lastSaveOk) toast.success(message, { description: entry.note })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
        <Button variant="ghost" size="icon-xs" aria-label={`「${entry.note}」的操作`} className="text-fg-3 hover:text-fg">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(event) => event.stopPropagation()}>
        {entry.status === "pending" && (
          <DropdownMenuItem onSelect={() => setStatus("received", `已到账 ${formatAmount(entry.amount)}`)}>
            <CircleCheck />
            标记已到账
          </DropdownMenuItem>
        )}
        {entry.kind === "income" && entry.status === "received" && (
          <DropdownMenuItem onSelect={() => setStatus("refunded", "已标记退款")}>
            <Undo2 />
            标记已退款
          </DropdownMenuItem>
        )}
        {entry.status === "refunded" && (
          <DropdownMenuItem onSelect={() => setStatus("received", "已改回已到账")}>
            <CircleCheck />
            改回已到账
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => openEntryForm({ mode: "edit", entryId: entry.id })}>
          <Pencil />
          编辑
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            deleteEntry(entry.id)
            if (useWorkbench.getState().lastSaveOk) {
              toast("已删除一笔记录", { description: entry.note, action: { label: "撤销", onClick: () => restoreEntry(entry) } })
            }
          }}
        >
          <Trash2 />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 一笔收支：日期、状态、说明、副业、分类、渠道、金额；待到账的显示约定日期。行宽不够时收起次要的列 */
export function EntryRow({ entry, project, today }: { entry: LedgerEntry; project: Project | undefined; today: DayKey }) {
  const openEntryForm = useUi((state) => state.openEntryForm)
  const status = ENTRY_STATUS[entry.status]
  const expected = entry.expectedOn ?? entry.date
  const late = entry.status === "pending" ? diffDays(today, expected) : 0
  const signed = entry.kind === "income" ? entry.amount : -entry.amount

  return (
    <div
      onClick={() => openEntryForm({ mode: "edit", entryId: entry.id })}
      className="group @container flex h-9 min-w-0 items-center gap-2.5 border-b border-line px-4 text-sm transition-colors duration-(--dur-fast) hover:bg-hover"
    >
      <StatusIcon glyph={status.glyph} tone={status.tone} label={status.label} />
      <span className="w-10 shrink-0 text-xs text-fg-2 tabular @md:w-[4.5rem]">
        {formatDayShort(entry.date)}
        <span className="hidden @md:inline"> {weekdayLabel(entry.date)}</span>
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          openEntryForm({ mode: "edit", entryId: entry.id })
        }}
        className={cn("min-w-0 flex-1 truncate text-left", entry.status === "refunded" && "text-fg-2", focusRing)}
        title={entry.note}
      >
        {entry.note}
      </button>
      {entry.status === "pending" && (
        <LabelChip color={late > 0 ? "red" : "amber"} className="shrink-0">
          <span className="@md:hidden">{late > 0 ? `逾期${late}天` : formatDayShort(expected)}</span>
          <span className="hidden @md:inline">{late > 0 ? `逾期 ${late} 天` : `约定 ${formatDayShort(expected)}`}</span>
        </LabelChip>
      )}
      {project && (
        <span className="hidden w-24 min-w-0 shrink-0 items-center gap-1.5 text-xs text-fg-2 @3xl:flex">
          <ProjectMark name={project.name} color={project.color} size={14} />
          <span className="truncate">{project.name}</span>
        </span>
      )}
      {!project && <span className="hidden w-24 shrink-0 text-xs text-fg-2 @3xl:inline">个人事务</span>}
      <LabelChip className="hidden w-[4.5rem] shrink-0 justify-center @xl:inline-flex">{categoryLabel(entry.category)}</LabelChip>
      <span className="hidden w-16 shrink-0 text-xs text-fg-2 @4xl:inline">{CHANNELS[entry.channel].label}</span>
      <span
        className={cn(
          "w-20 shrink-0 text-right tabular @md:w-24",
          entry.kind === "expense" && "text-fg-2",
          entry.status === "refunded" && "text-fg-2 line-through decoration-fg-3",
          entry.status === "pending" && "text-fg-2"
        )}
      >
        {formatSignedAmount(signed)}
      </span>
      <EntryMenu entry={entry} />
    </div>
  )
}
