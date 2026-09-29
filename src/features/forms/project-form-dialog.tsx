"use client"

import { cn } from "cn"
import { Check } from "lucide-react"
import { useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PROJECT_STAGE, PROJECT_STAGE_ORDER } from "@/data/catalog"
import type { LabelColor } from "@/domain/types"
import { amountUnit } from "@/domain/format"
import type { Project, ProjectStage } from "@/domain/types"
import { NAME_MAX, parseTarget, validateTitle } from "@/domain/validation"
import { focusRing } from "@/lib/styles"
import { useT } from "@/i18n/react"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"

const COLOR_KEYS: LabelColor[] = [
  "indigo",
  "blue",
  "teal",
  "green",
  "amber",
  "orange",
  "red",
  "pink",
  "violet",
  "gray",
]

function Body({ project }: { project: Project | null }) {
  const t = useT()
  const close = useUi((state) => state.closeProjectForm)
  const saveProject = useWorkbench((state) => state.saveProject)
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(project?.name ?? "")
  const [color, setColor] = useState<LabelColor>(project?.color ?? "blue")
  const [stage, setStage] = useState<ProjectStage>(project?.stage ?? "idea")
  const [goal, setGoal] = useState(project?.goal ?? "")
  const [target, setTarget] = useState(project?.monthlyTarget ? String(project.monthlyTarget) : "")
  const [errors, setErrors] = useState<{ name?: string; target?: string }>({})

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nameError = validateTitle(name, t.forms.project.name, NAME_MAX)
    const parsedTarget = parseTarget(target)
    const next = { name: nameError, target: parsedTarget === undefined ? t.forms.validation.target : undefined }
    setErrors(next)
    if (nameError) return nameRef.current?.focus()
    if (next.target) return
    const saved = saveProject({ name, color, stage, goal: goal.trim(), monthlyTarget: parsedTarget ?? null }, project?.id)
    close()
    if (useWorkbench.getState().lastSaveOk) toast.success(project ? t.forms.project.saved : t.forms.project.added(saved.name))
  }

  return (
    <form noValidate onSubmit={submit} className="contents">
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field id="project-name" label={t.forms.project.name} error={errors.name}>
            <Input
              ref={nameRef}
              id="project-name"
              autoFocus
              autoComplete="off"
              placeholder={t.forms.project.namePlaceholder}
              value={name}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "project-name-error" : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (errors.name) setErrors((current) => ({ ...current, name: undefined }))
              }}
            />
          </Field>
          <Field id="project-stage" label={t.forms.project.stage}>
            <Select value={stage} onValueChange={(value) => setStage(value as ProjectStage)}>
              <SelectTrigger id="project-stage" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {PROJECT_STAGE_ORDER.map((item) => (
                  <SelectItem key={item} value={item}>
                    <StatusIcon glyph={PROJECT_STAGE[item].glyph} tone={PROJECT_STAGE[item].tone} />
                    {PROJECT_STAGE[item].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-xs font-medium text-fg-2">{t.forms.project.color}</legend>
          <div role="radiogroup" aria-label={t.forms.project.color} className="flex flex-wrap gap-1.5">
            {COLOR_KEYS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={color === value}
                aria-label={t.forms.project.colors[value]}
                onClick={() => setColor(value)}
                className={cn("flex size-6 items-center justify-center rounded-md", focusRing)}
                style={{ background: `var(--label-${value})` }}
              >
                {color === value && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </fieldset>
        <Field id="project-goal" label={t.forms.project.goal}>
          <Textarea id="project-goal" rows={2} className="min-h-14" placeholder={t.forms.project.goalPlaceholder} value={goal} onChange={(event) => setGoal(event.target.value)} />
        </Field>
        <Field id="project-target" label={t.forms.project.target(amountUnit())} error={errors.target}>
          <Input
            id="project-target"
            inputMode="decimal"
            value={target}
            aria-invalid={errors.target ? true : undefined}
            onChange={(event) => {
              setTarget(event.target.value.replace(/[^\d.]/g, ""))
              if (errors.target) setErrors((current) => ({ ...current, target: undefined }))
            }}
          />
        </Field>
      </div>
      <DialogFooter className="border-t border-line px-4 py-3">
        <Button type="button" variant="ghost" onClick={close}>
          {t.words.cancel}
        </Button>
        <Button type="submit">{project ? t.words.save : t.forms.project.submitNew}</Button>
      </DialogFooter>
    </form>
  )
}

export function ProjectFormDialog() {
  const t = useT()
  const form = useUi((state) => state.projectForm)
  const close = useUi((state) => state.closeProjectForm)
  const projects = useWorkbench((state) => state.projects)
  const project = form?.projectId ? (projects.find((item) => item.id === form.projectId) ?? null) : null
  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[480px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>{project ? t.forms.project.editTitle(project.name) : t.forms.project.newTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.forms.project.description}</DialogDescription>
        </DialogHeader>
        {form && <Body key={form.projectId ?? "new"} project={project} />}
      </DialogContent>
    </Dialog>
  )
}
