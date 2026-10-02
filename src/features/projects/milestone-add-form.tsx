"use client"

import { Plus } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Input } from "@/components/ui/input"
import { addDays } from "@/domain/calendar"
import type { DayKey } from "@/domain/types"
import { validateMilestone } from "@/domain/validation"
import { useT } from "@/i18n/react"
import { useWorkbench } from "@/state/store"

/** 里程碑清单下面的添加行：写标题、选目标日期（默认两周后），回车添加 */
export function MilestoneAddForm({ projectId, today }: { projectId: string; today: DayKey }) {
  const t = useT()
  const addMilestone = useWorkbench((state) => state.addMilestone)
  const [title, setTitle] = useState("")
  const [due, setDue] = useState(addDays(today, 14))
  const [errors, setErrors] = useState<ReturnType<typeof validateMilestone>>({})
  const message = errors.title ?? errors.due

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateMilestone(title, due)
    setErrors(found)
    if (found.title || found.due) return
    addMilestone(projectId, title, due)
    setTitle("")
  }

  return (
    <form onSubmit={submit} noValidate className="mt-1 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Plus className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (errors.title) setErrors({ ...errors, title: undefined })
          }}
          placeholder={t.projects.sheet.milestonePlaceholder}
          aria-label={t.projects.sheet.milestoneNew}
          aria-invalid={errors.title ? true : undefined}
          className="h-7 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-3 md:text-sm"
        />
        <Input
          type="date"
          aria-label={t.projects.sheet.milestoneDue}
          aria-invalid={errors.due ? true : undefined}
          value={due}
          onChange={(event) => {
            setDue(event.target.value)
            if (errors.due) setErrors({ ...errors, due: undefined })
          }}
          className="h-7 w-[8.5rem]"
        />
      </div>
      {message && (
        <p role="alert" className="pl-[22px] text-xs text-bad">
          {message}
        </p>
      )}
    </form>
  )
}
