"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatMinutesLong } from "@/domain/format"
import type { Profile } from "@/domain/types"
import { validateTitle } from "@/domain/validation"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"

const DURATIONS = [60, 90, 120, 150, 180, 240, 300, 360, 420, 480]
const HOURS = Array.from({ length: 25 }, (_, hour) => hour)

function MinutesSelect({ id, value, onChange }: { id: string; value: number; onChange(value: number): void }) {
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {DURATIONS.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)}>
            {formatMinutesLong(minutes)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function HourSelect({ id, value, onChange, min, max }: { id: string; value: number; onChange(value: number): void; min: number; max: number }) {
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {HOURS.filter((hour) => hour >= min && hour <= max).map((hour) => (
          <SelectItem key={hour} value={String(hour)}>
            {hour}:00
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Body() {
  const profile = useWorkbench((state) => state.profile)
  const updateProfile = useWorkbench((state) => state.updateProfile)
  const setOpen = useUi((state) => state.setProfileOpen)
  const [draft, setDraft] = useState<Profile>(profile)
  const [error, setError] = useState<string>()
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateTitle(draft.name, "称呼", 12)
    setError(found)
    if (found) return
    updateProfile({ ...draft, name: draft.name.trim() })
    setOpen(false)
    if (useWorkbench.getState().lastSaveOk) toast.success("已保存")
  }

  return (
    <form noValidate onSubmit={submit} className="contents">
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
        <Field id="profile-name" label="称呼" error={error} className="sm:col-span-2">
          <Input id="profile-name" value={draft.name} aria-invalid={error ? true : undefined} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field id="profile-weekday" label="工作日可用">
          <MinutesSelect id="profile-weekday" value={draft.weekdayMin} onChange={(value) => set("weekdayMin", value)} />
        </Field>
        <Field id="profile-weekend" label="周末可用">
          <MinutesSelect id="profile-weekend" value={draft.weekendMin} onChange={(value) => set("weekendMin", value)} />
        </Field>
        <Field id="profile-start" label="时间线从">
          <HourSelect id="profile-start" value={draft.dayStartHour} min={0} max={draft.dayEndHour - 4} onChange={(value) => set("dayStartHour", value)} />
        </Field>
        <Field id="profile-end" label="时间线到">
          <HourSelect id="profile-end" value={draft.dayEndHour} min={draft.dayStartHour + 4} max={24} onChange={(value) => set("dayEndHour", value)} />
        </Field>
      </div>
      <DialogFooter className="border-t border-line px-4 py-3">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  )
}

/** 作息设置：每天能拿出多少时间，决定容量条和「超出」提醒 */
export function ProfileDialog() {
  const open = useUi((state) => state.profileOpen)
  const setOpen = useUi((state) => state.setProfileOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-[440px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>可用时间</DialogTitle>
          <DialogDescription className="sr-only">每天能拿出多少时间做副业和自己的事</DialogDescription>
        </DialogHeader>
        {open && <Body />}
      </DialogContent>
    </Dialog>
  )
}
