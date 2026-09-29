"use client"

import { NotebookPen } from "lucide-react"
import { toast } from "sonner"

import { BoardColumn, Surface } from "@/components/base/board"
import { Textarea } from "@/components/ui/textarea"
import type { DayKey, WeekNote } from "@/domain/types"
import { useT } from "@/i18n/react"
import { useWorkbench } from "@/state/store"

const FIELDS: (keyof Omit<WeekNote, "week">)[] = ["wins", "improve", "next"]

/** 三段复盘笔记：离开输入框就自动保存 */
export function ReviewNotes({ week }: { week: DayKey }) {
  const t = useT()
  const notes = useWorkbench((state) => state.notes)
  const saveNote = useWorkbench((state) => state.saveNote)
  const note = notes.find((item) => item.week === week)

  return (
    <BoardColumn icon={<NotebookPen className="size-4 text-fg-2" aria-hidden />} title={t.review.notes.title}>
      <Surface className="grid gap-3 px-3 py-3 md:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field} className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`note-${field}`} className="text-xs font-medium text-fg-2">
              {t.review.notes[field].label}
            </label>
            <Textarea
              key={`${week}-${field}`}
              id={`note-${field}`}
              defaultValue={note?.[field] ?? ""}
              placeholder={t.review.notes[field].placeholder}
              rows={3}
              className="min-h-20 resize-y"
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (value === (note?.[field] ?? "")) return
                saveNote(week, { [field]: value })
                if (useWorkbench.getState().lastSaveOk) toast.success(t.review.notes.saved, { duration: 1500 })
              }}
            />
          </div>
        ))}
      </Surface>
    </BoardColumn>
  )
}
