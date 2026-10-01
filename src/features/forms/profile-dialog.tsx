"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CURRENCIES, currencyLabel } from "@/data/catalog"
import { formatMinutesLong, profileCurrency } from "@/domain/format"
import { IS_LOCAL_EDITION } from "@/lib/edition"
import { buildTimeZoneOptions, formatTimeZoneOffset } from "./time-zones"
import type { Profile } from "@/domain/types"
import { validateTitle } from "@/domain/validation"
import { useT } from "@/i18n/react"
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
  const t = useT()
  const profile = useWorkbench((state) => state.profile)
  const updateProfile = useWorkbench((state) => state.updateProfile)
  const setOpen = useUi((state) => state.setProfileOpen)
  const [draft, setDraft] = useState<Profile>(profile)
  const [error, setError] = useState<string>()
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const timeZoneOptions = buildTimeZoneOptions(draft.timeZone, browserTimeZone)
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateTitle(draft.name, t.forms.profile.name, 12)
    setError(found)
    if (found) return
    const nextProfile = { ...draft, name: draft.name.trim() }
    if (!IS_LOCAL_EDITION && !nextProfile.timeZone && browserTimeZone) nextProfile.timeZone = browserTimeZone
    updateProfile(nextProfile)
    setOpen(false)
    if (useWorkbench.getState().lastSaveOk) toast.success(t.forms.profile.saved)
  }

  return (
    <form noValidate onSubmit={submit} className="contents">
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
        <Field id="profile-name" label={t.forms.profile.name} error={error} className="sm:col-span-2">
          <Input id="profile-name" value={draft.name} aria-invalid={error ? true : undefined} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field id="profile-weekday" label={t.forms.profile.weekday}>
          <MinutesSelect id="profile-weekday" value={draft.weekdayMin} onChange={(value) => set("weekdayMin", value)} />
        </Field>
        <Field id="profile-weekend" label={t.forms.profile.weekend}>
          <MinutesSelect id="profile-weekend" value={draft.weekendMin} onChange={(value) => set("weekendMin", value)} />
        </Field>
        <Field id="profile-start" label={t.forms.profile.dayStart}>
          <HourSelect id="profile-start" value={draft.dayStartHour} min={0} max={draft.dayEndHour - 4} onChange={(value) => set("dayStartHour", value)} />
        </Field>
        <Field id="profile-end" label={t.forms.profile.dayEnd}>
          <HourSelect id="profile-end" value={draft.dayEndHour} min={draft.dayStartHour + 4} max={24} onChange={(value) => set("dayEndHour", value)} />
        </Field>
        <Field id="profile-currency" label={t.forms.profile.currency} className="sm:col-span-2">
          <Select value={profileCurrency(draft)} onValueChange={(value) => set("currency", value)}>
            <SelectTrigger id="profile-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {CURRENCIES.map((code) => (
                <SelectItem key={code} value={code}>
                  {currencyLabel(code)} ({code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {!IS_LOCAL_EDITION && (
          <Field id="profile-time-zone" label={t.forms.profile.timeZone} className="sm:col-span-2">
            <Select value={draft.timeZone || browserTimeZone} onValueChange={(value) => set("timeZone", value)}>
              <SelectTrigger id="profile-time-zone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {timeZoneOptions.map((zone) => {
                  const offset = formatTimeZoneOffset(zone)
                  return (
                    <SelectItem key={zone} value={zone}>
                      {zone}{offset ? ` (${offset})` : ""}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
      <DialogFooter className="border-t border-line px-4 py-3">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t.words.cancel}
        </Button>
        <Button type="submit">{t.words.save}</Button>
      </DialogFooter>
    </form>
  )
}

/** 作息设置：每天能拿出多少时间，决定容量条和「超出」提醒 */
export function ProfileDialog() {
  const t = useT()
  const open = useUi((state) => state.profileOpen)
  const setOpen = useUi((state) => state.setProfileOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-[440px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>{t.forms.profile.title}</DialogTitle>
          <DialogDescription className="sr-only">{t.forms.profile.description}</DialogDescription>
        </DialogHeader>
        {open && <Body />}
      </DialogContent>
    </Dialog>
  )
}
