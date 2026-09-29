"use client"

import { NotebookPen } from "lucide-react"
import { toast } from "sonner"

import { BoardColumn, Surface } from "@/components/base/board"
import { Textarea } from "@/components/ui/textarea"
import type { DayKey, WeekNote } from "@/domain/types"
import { useWorkbench } from "@/state/store"

const FIELDS: { key: keyof Omit<WeekNote, "week">; label: string; placeholder: string }[] = [
  { key: "wins", label: "做得好的", placeholder: "这周最满意的一件事" },
  { key: "improve", label: "可以更好的", placeholder: "卡住、拖延或者估错的地方" },
  { key: "next", label: "下周只做", placeholder: "下周最重要的一两件事" },
]

/** 三段复盘笔记：离开输入框就自动保存 */
export function ReviewNotes({ week }: { week: DayKey }) {
  const notes = useWorkbench((state) => state.notes)
  const saveNote = useWorkbench((state) => state.saveNote)
  const note = notes.find((item) => item.week === week)

  return (
    <BoardColumn icon={<NotebookPen className="size-4 text-fg-2" aria-hidden />} title="复盘">
      <Surface className="grid gap-3 px-3 py-3 md:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`note-${field.key}`} className="text-xs font-medium text-fg-2">
              {field.label}
            </label>
            <Textarea
              key={`${week}-${field.key}`}
              id={`note-${field.key}`}
              defaultValue={note?.[field.key] ?? ""}
              placeholder={field.placeholder}
              rows={3}
              className="min-h-20 resize-y"
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (value === (note?.[field.key] ?? "")) return
                saveNote(week, { [field.key]: value })
                if (useWorkbench.getState().lastSaveOk) toast.success("已保存", { duration: 1500 })
              }}
            />
          </div>
        ))}
      </Surface>
    </BoardColumn>
  )
}
