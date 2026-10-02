"use client"

import { cn } from "cn"
import { Check, X } from "lucide-react"
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
import { DIR_NAMES_MAX } from "@/domain/dir-names"
import type { LabelColor } from "@/domain/types"
import { amountUnit } from "@/domain/format"
import type { Project, ProjectStage } from "@/domain/types"
import { NAME_MAX, parseTarget, validateTitle } from "@/domain/validation"
import { focusRing } from "@/lib/styles"
import { dirNamesErrorText } from "../common/dir-names-error-text"
import { IS_LOCAL_EDITION } from "@/lib/edition"
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
  const dirNameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(project?.name ?? "")
  const [color, setColor] = useState<LabelColor>(project?.color ?? "blue")
  const [stage, setStage] = useState<ProjectStage>(project?.stage ?? "idea")
  const [goal, setGoal] = useState(project?.goal ?? "")
  const [target, setTarget] = useState(project?.monthlyTarget ? String(project.monthlyTarget) : "")
  const [dirNames, setDirNames] = useState(project?.dirNames ?? [])
  const [dirNameDraft, setDirNameDraft] = useState("")
  const [errors, setErrors] = useState<{ name?: string; target?: string; dirNames?: string }>({})

  const addDirName = () => {
    const value = dirNameDraft.trim()
    if (!value || dirNames.length >= DIR_NAMES_MAX) return
    setDirNames((current) => (current.length < DIR_NAMES_MAX ? [...current, value] : current))
    setDirNameDraft("")
    setErrors((current) => ({ ...current, dirNames: undefined }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nameError = validateTitle(name, t.forms.project.name, NAME_MAX)
    const parsedTarget = parseTarget(target)
    const next = { name: nameError, target: parsedTarget === undefined ? t.forms.validation.target : undefined }
    setErrors(next)
    if (nameError) return nameRef.current?.focus()
    if (next.target) return

    const namesToSave = !IS_LOCAL_EDITION && dirNameDraft.trim() ? [...dirNames, dirNameDraft.trim()] : dirNames
    if (!IS_LOCAL_EDITION && dirNameDraft.trim()) {
      setDirNames(namesToSave)
      setDirNameDraft("")
    }
    const saved = saveProject({
      name,
      color,
      stage,
      goal: goal.trim(),
      monthlyTarget: parsedTarget ?? null,
      ...(!IS_LOCAL_EDITION ? { dirNames: namesToSave } : {}),
    }, project?.id)
    if (!saved.ok) {
      setErrors({ ...next, dirNames: dirNamesErrorText(saved.error) })
      dirNameRef.current?.focus()
      return
    }
    close()
    if (useWorkbench.getState().lastSaveOk) toast.success(project ? t.forms.project.saved : t.forms.project.added(saved.project.name))
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
        {!IS_LOCAL_EDITION && (
          <Field id="project-dir-names" label={t.projects.directoryNames.label} error={errors.dirNames}>
            {dirNames.length > 0 && (
              <div className="flex min-w-0 flex-wrap gap-1.5" role="list" aria-label={t.projects.directoryNames.label}>
                {dirNames.map((dirName, index) => (
                  <span key={`${dirName}-${index}`} role="listitem" className="inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md border border-line-2 bg-card pl-1.5 pr-0.5 text-xs text-fg-2">
                    <span className="truncate">{dirName}</span>
                    <button
                      type="button"
                      aria-label={t.projects.directoryNames.remove(dirName)}
                      onClick={() => {
                        setDirNames((current) => current.filter((_, itemIndex) => itemIndex !== index))
                        setErrors((current) => ({ ...current, dirNames: undefined }))
                      }}
                      className={cn("flex size-4 shrink-0 items-center justify-center rounded text-fg-3 hover:bg-hover hover:text-fg", focusRing)}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Input
                ref={dirNameRef}
                id="project-dir-names"
                autoComplete="off"
                value={dirNameDraft}
                disabled={dirNames.length >= DIR_NAMES_MAX}
                aria-invalid={errors.dirNames ? true : undefined}
                aria-describedby={`project-dir-names-hint${errors.dirNames ? " project-dir-names-error" : ""}`}
                onChange={(event) => setDirNameDraft(event.target.value)}
                onBlur={addDirName}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
                  if (dirNameDraft.trim()) {
                    event.preventDefault()
                    addDirName()
                  }
                }}
                className="min-w-0 flex-1"
              />
              <span id="project-dir-names-hint" className="text-xs text-fg-3">
                {t.projects.directoryNames.hint}
              </span>
            </div>
          </Field>
        )}
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
