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
import type { Project, ProjectStage } from "@/domain/types"
import { NAME_MAX, parseTarget, validateTitle } from "@/domain/validation"
import { focusRing } from "@/lib/styles"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"

const COLORS: { value: LabelColor; label: string }[] = [
  { value: "indigo", label: "靛蓝" },
  { value: "blue", label: "蓝" },
  { value: "teal", label: "青" },
  { value: "green", label: "绿" },
  { value: "amber", label: "琥珀" },
  { value: "orange", label: "橙" },
  { value: "red", label: "红" },
  { value: "pink", label: "粉" },
  { value: "violet", label: "紫" },
  { value: "gray", label: "灰" },
]

function Body({ project }: { project: Project | null }) {
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
    const nameError = validateTitle(name, "副业名称", NAME_MAX)
    const parsedTarget = parseTarget(target)
    const next = { name: nameError, target: parsedTarget === undefined ? "月目标需要是大于 0 的金额" : undefined }
    setErrors(next)
    if (nameError) return nameRef.current?.focus()
    if (next.target) return
    const saved = saveProject({ name, color, stage, goal: goal.trim(), monthlyTarget: parsedTarget ?? null }, project?.id)
    close()
    if (useWorkbench.getState().lastSaveOk) toast.success(project ? "已保存" : `已添加副业「${saved.name}」`)
  }

  return (
    <form noValidate onSubmit={submit} className="contents">
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field id="project-name" label="名称" error={errors.name}>
            <Input
              ref={nameRef}
              id="project-name"
              autoFocus
              autoComplete="off"
              placeholder="例如：模板商城"
              value={name}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "project-name-error" : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (errors.name) setErrors((current) => ({ ...current, name: undefined }))
              }}
            />
          </Field>
          <Field id="project-stage" label="阶段">
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
          <legend className="pb-1.5 text-xs font-medium text-fg-2">颜色</legend>
          <div role="radiogroup" aria-label="颜色" className="flex flex-wrap gap-1.5">
            {COLORS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={color === item.value}
                aria-label={item.label}
                onClick={() => setColor(item.value)}
                className={cn("flex size-6 items-center justify-center rounded-md", focusRing)}
                style={{ background: `var(--label-${item.value})` }}
              >
                {color === item.value && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </fieldset>
        <Field id="project-goal" label="目标">
          <Textarea id="project-goal" rows={2} className="min-h-14" placeholder="一句话说清楚做成什么样" value={goal} onChange={(event) => setGoal(event.target.value)} />
        </Field>
        <Field id="project-target" label="每月净收入目标（元，可不填）" error={errors.target}>
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
          取消
        </Button>
        <Button type="submit">{project ? "保存" : "添加"}</Button>
      </DialogFooter>
    </form>
  )
}

export function ProjectFormDialog() {
  const form = useUi((state) => state.projectForm)
  const close = useUi((state) => state.closeProjectForm)
  const projects = useWorkbench((state) => state.projects)
  const project = form?.projectId ? (projects.find((item) => item.id === form.projectId) ?? null) : null
  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[480px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>{project ? `编辑「${project.name}」` : "新的副业"}</DialogTitle>
          <DialogDescription className="sr-only">副业的名称、阶段和目标</DialogDescription>
        </DialogHeader>
        {form && <Body key={form.projectId ?? "new"} project={project} />}
      </DialogContent>
    </Dialog>
  )
}
