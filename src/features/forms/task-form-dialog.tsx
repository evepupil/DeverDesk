"use client"

import { useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { TASK_TITLE_MAX, validateTitle } from "@/domain/validation"
import type { Priority, Task, TaskStatus } from "@/domain/types"
import { EstimateOptions, NO_PROJECT, PriorityOptions, ProjectOptions, StatusOptions } from "@/features/common/property-controls"
import type { TaskInput } from "@/state/store"
import { useWorkbench } from "@/state/store"
import { useUi, type TaskFormState } from "@/state/ui"

function FormSelect({ id, value, onChange, children }: { id: string; value: string; onChange(value: string): void; children: React.ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">{children}</SelectContent>
    </Select>
  )
}

function draftOf(task: Task | null, preset?: Partial<TaskInput>): TaskInput {
  if (task) {
    const { title, projectId, status, priority, estimateMin, plannedFor, startAt, dueOn, notes } = task
    return { title, projectId, status, priority, estimateMin, plannedFor, startAt, dueOn, notes }
  }
  return {
    title: "",
    projectId: null,
    status: "todo",
    priority: 0,
    estimateMin: 30,
    plannedFor: null,
    startAt: null,
    dueOn: null,
    notes: "",
    ...preset,
  }
}

function Body({ form, task }: { form: TaskFormState; task: Task | null }) {
  const close = useUi((state) => state.closeTaskForm)
  const openTask = useUi((state) => state.openTask)
  const projects = useWorkbench((state) => state.projects)
  const createTask = useWorkbench((state) => state.createTask)
  const updateTask = useWorkbench((state) => state.updateTask)
  const titleRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<TaskInput>(() => draftOf(task, form.mode === "create" ? form.preset : undefined))
  const [error, setError] = useState<string>()
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateTitle(draft.title)
    setError(found)
    if (found) return titleRef.current?.focus()
    const input = { ...draft, startAt: draft.plannedFor ? draft.startAt : null }
    if (task) {
      updateTask(task.id, input)
      close()
      if (useWorkbench.getState().lastSaveOk) toast.success("已保存")
      return
    }
    const created = createTask(input)
    close()
    if (useWorkbench.getState().lastSaveOk) {
      toast.success(`已新建 ${created.id}`, { description: created.title, action: { label: "查看", onClick: () => openTask(created.id) } })
    }
  }

  return (
    <form noValidate onSubmit={submit} className="contents">
      <div className="flex flex-col gap-3 px-4 py-4">
        <Field id="task-title" label="任务" error={error}>
          <Input
            ref={titleRef}
            id="task-title"
            autoFocus
            autoComplete="off"
            maxLength={TASK_TITLE_MAX + 20}
            placeholder="要做的一件事，动词开头最好"
            value={draft.title}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "task-title-error" : undefined}
            onChange={(event) => {
              set("title", event.target.value)
              if (error) setError(undefined)
            }}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="task-form-project" label="副业">
            <FormSelect
              id="task-form-project"
              value={draft.projectId ?? NO_PROJECT}
              onChange={(value) => set("projectId", value === NO_PROJECT ? null : value)}
            >
              <ProjectOptions projects={projects} />
            </FormSelect>
          </Field>
          <Field id="task-form-status" label="状态">
            <FormSelect id="task-form-status" value={draft.status} onChange={(value) => set("status", value as TaskStatus)}>
              <StatusOptions />
            </FormSelect>
          </Field>
          <Field id="task-form-priority" label="优先级">
            <FormSelect id="task-form-priority" value={String(draft.priority)} onChange={(value) => set("priority", Number(value) as Priority)}>
              <PriorityOptions />
            </FormSelect>
          </Field>
          <Field id="task-form-estimate" label="预估">
            <FormSelect id="task-form-estimate" value={String(draft.estimateMin)} onChange={(value) => set("estimateMin", Number(value))}>
              <EstimateOptions current={draft.estimateMin} />
            </FormSelect>
          </Field>
          <Field id="task-form-plan" label="计划哪天做">
            <Input
              id="task-form-plan"
              type="date"
              value={draft.plannedFor ?? ""}
              onChange={(event) => set("plannedFor", event.target.value || null)}
            />
          </Field>
          <Field id="task-form-start" label="几点开始">
            <Input
              id="task-form-start"
              type="time"
              step={900}
              disabled={!draft.plannedFor}
              value={draft.startAt ?? ""}
              onChange={(event) => set("startAt", event.target.value || null)}
            />
          </Field>
          <Field id="task-form-due" label="截止">
            <Input id="task-form-due" type="date" value={draft.dueOn ?? ""} onChange={(event) => set("dueOn", event.target.value || null)} />
          </Field>
        </div>
        <Field id="task-form-notes" label="备注">
          <Textarea id="task-form-notes" rows={2} className="min-h-14" value={draft.notes} onChange={(event) => set("notes", event.target.value)} />
        </Field>
      </div>
      <DialogFooter className="border-t border-line px-4 py-3">
        <Button type="button" variant="ghost" onClick={close}>
          取消
        </Button>
        <Button type="submit">{task ? "保存" : "新建"}</Button>
      </DialogFooter>
    </form>
  )
}

/** 新建 / 编辑任务（提炼补全：编辑弹窗；名称为空就地提示） */
export function TaskFormDialog() {
  const form = useUi((state) => state.taskForm)
  const close = useUi((state) => state.closeTaskForm)
  const tasks = useWorkbench((state) => state.tasks)
  const task = form?.mode === "edit" ? (tasks.find((item) => item.id === form.taskId) ?? null) : null
  const key = form ? (form.mode === "edit" ? `edit-${form.taskId}` : `create-${JSON.stringify(form.preset ?? {})}`) : "none"

  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>{task ? `编辑 ${task.id}` : "新建任务"}</DialogTitle>
          <DialogDescription className="sr-only">填写任务信息</DialogDescription>
        </DialogHeader>
        {form && <Body key={key} form={form} task={task} />}
      </DialogContent>
    </Dialog>
  )
}
