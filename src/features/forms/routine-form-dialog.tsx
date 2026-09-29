"use client"

import { useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CADENCE, CADENCE_ORDER } from "@/data/catalog"
import type { Cadence, Routine } from "@/domain/types"
import { NAME_MAX, validateTitle } from "@/domain/validation"
import { EstimateOptions, NO_PROJECT, ProjectOptions } from "@/features/common/property-controls"
import { useT } from "@/i18n/react"
import { useWorkbench, type RoutineInput } from "@/state/store"
import { useUi } from "@/state/ui"

function Body({ routine }: { routine: Routine | null }) {
  const t = useT()
  const close = useUi((state) => state.closeRoutineForm)
  const projects = useWorkbench((state) => state.projects)
  const saveRoutine = useWorkbench((state) => state.saveRoutine)
  const archiveRoutine = useWorkbench((state) => state.archiveRoutine)
  const titleRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<RoutineInput>(() =>
    routine
      ? { title: routine.title, cadence: routine.cadence, estimateMin: routine.estimateMin, projectId: routine.projectId }
      : { title: "", cadence: "daily", estimateMin: 30, projectId: null }
  )
  const [error, setError] = useState<string>()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateTitle(draft.title, t.forms.routine.title, NAME_MAX * 2)
    setError(found)
    if (found) return titleRef.current?.focus()
    saveRoutine(draft, routine?.id)
    close()
    if (useWorkbench.getState().lastSaveOk) toast.success(routine ? t.forms.routine.saved : t.forms.routine.added)
  }

  return (
    <form noValidate onSubmit={submit} className="contents">
      <div className="flex flex-col gap-3 px-4 py-4">
        <Field id="routine-title" label={t.forms.routine.title} error={error}>
          <Input
            ref={titleRef}
            id="routine-title"
            autoFocus
            autoComplete="off"
            placeholder={t.forms.routine.titlePlaceholder}
            value={draft.title}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "routine-title-error" : undefined}
            onChange={(event) => {
              setDraft((current) => ({ ...current, title: event.target.value }))
              if (error) setError(undefined)
            }}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="routine-cadence" label={t.forms.routine.cadence}>
            <Select value={draft.cadence} onValueChange={(value) => setDraft((current) => ({ ...current, cadence: value as Cadence }))}>
              <SelectTrigger id="routine-cadence" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {CADENCE_ORDER.map((cadence) => (
                  <SelectItem key={cadence} value={cadence}>
                    {CADENCE[cadence].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="routine-estimate" label={t.forms.routine.estimate}>
            <Select value={String(draft.estimateMin)} onValueChange={(value) => setDraft((current) => ({ ...current, estimateMin: Number(value) }))}>
              <SelectTrigger id="routine-estimate" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <EstimateOptions current={draft.estimateMin} />
              </SelectContent>
            </Select>
          </Field>
          <Field id="routine-project" label={t.forms.routine.project}>
            <Select
              value={draft.projectId ?? NO_PROJECT}
              onValueChange={(value) => setDraft((current) => ({ ...current, projectId: value === NO_PROJECT ? null : value }))}
            >
              <SelectTrigger id="routine-project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <ProjectOptions projects={projects} />
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
      <DialogFooter className="border-t border-line px-4 py-3 sm:justify-between">
        {routine ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              archiveRoutine(routine.id)
              close()
              if (useWorkbench.getState().lastSaveOk) toast.success(t.forms.routine.archived(routine.title))
            }}
          >
            {t.forms.routine.archive}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={close}>
            {t.words.cancel}
          </Button>
          <Button type="submit">{routine ? t.words.save : t.forms.routine.submitNew}</Button>
        </div>
      </DialogFooter>
    </form>
  )
}

export function RoutineFormDialog() {
  const t = useT()
  const form = useUi((state) => state.routineForm)
  const close = useUi((state) => state.closeRoutineForm)
  const routines = useWorkbench((state) => state.routines)
  const routine = form?.routineId ? (routines.find((item) => item.id === form.routineId) ?? null) : null
  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[480px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>{routine ? t.forms.routine.editTitle : t.forms.routine.newTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.forms.routine.description}</DialogDescription>
        </DialogHeader>
        {form && <Body key={form.routineId ?? "new"} routine={routine} />}
      </DialogContent>
    </Dialog>
  )
}
