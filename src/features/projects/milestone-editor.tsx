"use client"

import { Check, X } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DayKey, Milestone } from "@/domain/types"
import { validateMilestone } from "@/domain/validation"
import { useT } from "@/i18n/react"

/** 编辑框的标记，要和下面表单上的 data-milestone-editor 对上 */
const EDITOR_SELECTOR = "[data-milestone-editor]"

/**
 * 焦点在编辑框里时，Esc 的意思是「取消编辑」。
 * 侧栏收到 Esc 时先问一句，是编辑框里按的就别把整个侧栏关掉。
 */
export function isInMilestoneEditor(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITOR_SELECTOR) !== null
}

export interface MilestoneDraft {
  title: string
  due: DayKey
}

/** 一条里程碑的行内编辑框：改标题和目标日期，回车保存，Esc 或叉取消；写得不对就地红字 */
export function MilestoneEditor({ milestone, onSave, onCancel }: { milestone: Milestone; onSave(draft: MilestoneDraft): void; onCancel(): void }) {
  const t = useT()
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(milestone.title)
  const [due, setDue] = useState(milestone.due)
  const [errors, setErrors] = useState<ReturnType<typeof validateMilestone>>({})
  const message = errors.title ?? errors.due

  useEffect(() => {
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateMilestone(title, due)
    setErrors(found)
    if (found.title || found.due) return
    onSave({ title: title.trim(), due })
  }

  const cancelOnEscape = (event: KeyboardEvent) => {
    // 输入法选字时按 Esc 只是收起候选框，不算取消
    if (event.key === "Escape" && !event.nativeEvent.isComposing) onCancel()
  }

  return (
    <form onSubmit={submit} onKeyDown={cancelOnEscape} noValidate data-milestone-editor="" className="flex flex-col gap-1 py-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          ref={titleRef}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (errors.title) setErrors({ ...errors, title: undefined })
          }}
          aria-label={t.projects.sheet.milestoneName}
          aria-invalid={errors.title ? true : undefined}
          className="min-w-36 flex-1"
        />
        <Input
          type="date"
          value={due}
          onChange={(event) => {
            setDue(event.target.value)
            if (errors.due) setErrors({ ...errors, due: undefined })
          }}
          aria-label={t.projects.sheet.milestoneDue}
          aria-invalid={errors.due ? true : undefined}
          className="w-[8.5rem] shrink-0"
        />
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button type="submit" variant="ghost" size="icon-sm" aria-label={t.words.save}>
            <Check />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t.words.cancel} onClick={onCancel}>
            <X />
          </Button>
        </div>
      </div>
      {message && (
        <p role="alert" className="text-xs text-bad">
          {message}
        </p>
      )}
    </form>
  )
}
