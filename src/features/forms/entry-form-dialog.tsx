"use client"

import { useRef, useState, type FormEvent, type ReactNode } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { Segmented } from "@/components/base/segmented"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  CHANNELS,
  CHANNEL_ORDER,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ORDER,
  INCOME_CATEGORIES,
  INCOME_CATEGORY_ORDER,
  categoryLabel,
} from "@/data/catalog"
import { todayKey } from "@/domain/calendar"
import { amountUnit, formatAmount } from "@/domain/format"
import { parseAmount } from "@/domain/ledger"
import type { Channel, EntryKind, EntryStatus, LedgerEntry } from "@/domain/types"
import { validateEntry } from "@/domain/validation"
import { NO_PROJECT, ProjectOptions } from "@/features/common/property-controls"
import { useT } from "@/i18n/react"
import { useWorkbench, type EntryInput } from "@/state/store"
import { useUi, type EntryFormState } from "@/state/ui"

function FormSelect({ id, value, onChange, children }: { id: string; value: string; onChange(value: string): void; children: ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">{children}</SelectContent>
    </Select>
  )
}

interface Draft {
  kind: EntryKind
  amount: string
  date: string
  projectId: string | null
  category: string
  channel: Channel
  status: EntryStatus
  expectedOn: string
  note: string
}

function draftOf(entry: LedgerEntry | null, preset?: Partial<EntryInput>): Draft {
  if (entry) {
    return {
      kind: entry.kind,
      amount: String(entry.amount),
      date: entry.date,
      projectId: entry.projectId,
      category: entry.category,
      channel: entry.channel,
      status: entry.status,
      expectedOn: entry.expectedOn ?? "",
      note: entry.note,
    }
  }
  const kind = preset?.kind ?? "income"
  return {
    kind,
    amount: preset?.amount ? String(preset.amount) : "",
    date: preset?.date ?? todayKey(),
    projectId: preset?.projectId ?? null,
    category: preset?.category ?? (kind === "income" ? "sales" : "server"),
    channel: preset?.channel ?? "alipay",
    status: preset?.status ?? "received",
    expectedOn: preset?.expectedOn ?? "",
    note: preset?.note ?? "",
  }
}

function Body({ form, entry }: { form: EntryFormState; entry: LedgerEntry | null }) {
  const t = useT()
  const close = useUi((state) => state.closeEntryForm)
  const projects = useWorkbench((state) => state.projects)
  const saveEntry = useWorkbench((state) => state.saveEntry)
  const deleteEntry = useWorkbench((state) => state.deleteEntry)
  const amountRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<Draft>(() => draftOf(entry, form.mode === "create" ? form.preset : undefined))
  const [errors, setErrors] = useState<ReturnType<typeof validateEntry>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const switchKind = (kind: EntryKind) =>
    setDraft((current) => ({
      ...current,
      kind,
      category: kind === "income" ? "sales" : "server",
      status: kind === "expense" && current.status === "pending" ? "received" : current.status,
    }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateEntry(draft)
    setErrors(found)
    if (found.amount) return amountRef.current?.focus()
    if (Object.values(found).some(Boolean)) return
    const amount = parseAmount(draft.amount) as number
    const pending = draft.kind === "income" && draft.status === "pending"
    const input: EntryInput = {
      kind: draft.kind,
      amount,
      date: draft.date,
      projectId: draft.projectId,
      category: draft.category as EntryInput["category"],
      channel: draft.channel,
      status: draft.kind === "expense" ? "received" : draft.status,
      expectedOn: pending ? draft.expectedOn : null,
      note: draft.note.trim() || t.forms.entry.defaultNote(categoryLabel(draft.category), draft.kind),
    }
    saveEntry(input, entry?.id)
    close()
    if (useWorkbench.getState().lastSaveOk) {
      toast.success(entry ? t.forms.entry.saved : t.forms.entry.savedEntry(draft.kind, formatAmount(amount)))
    }
  }

  const categories =
    draft.kind === "income"
      ? INCOME_CATEGORY_ORDER.map((key) => ({ key, label: INCOME_CATEGORIES[key].label }))
      : EXPENSE_CATEGORY_ORDER.map((key) => ({ key, label: EXPENSE_CATEGORIES[key].label }))

  return (
    <form noValidate onSubmit={submit} className="contents">
      <div className="flex flex-col gap-3 px-4 py-4">
        <Segmented
          label={t.forms.entry.kindLabel}
          value={draft.kind}
          options={[
            { value: "income", label: t.forms.entry.kindIncome },
            { value: "expense", label: t.forms.entry.kindExpense },
          ]}
          onChange={switchKind}
          className="self-start"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="entry-amount" label={t.forms.entry.amount(amountUnit())} error={errors.amount}>
            <Input
              ref={amountRef}
              id="entry-amount"
              autoFocus
              inputMode="decimal"
              placeholder={t.forms.entry.amountPlaceholder}
              value={draft.amount}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? "entry-amount-error" : undefined}
              onChange={(event) => set("amount", event.target.value.replace(/[^\d.]/g, ""))}
            />
          </Field>
          <Field id="entry-date" label={t.forms.entry.date} error={errors.date}>
            <Input id="entry-date" type="date" value={draft.date} onChange={(event) => set("date", event.target.value)} />
          </Field>
          <Field id="entry-project" label={t.forms.entry.project}>
            <FormSelect id="entry-project" value={draft.projectId ?? NO_PROJECT} onChange={(value) => set("projectId", value === NO_PROJECT ? null : value)}>
              <ProjectOptions projects={projects} />
            </FormSelect>
          </Field>
          <Field id="entry-category" label={t.forms.entry.category}>
            <FormSelect id="entry-category" value={draft.category} onChange={(value) => set("category", value)}>
              {categories.map((category) => (
                <SelectItem key={category.key} value={category.key}>
                  {category.label}
                </SelectItem>
              ))}
            </FormSelect>
          </Field>
          <Field id="entry-channel" label={t.forms.entry.channel}>
            <FormSelect id="entry-channel" value={draft.channel} onChange={(value) => set("channel", value as Channel)}>
              {CHANNEL_ORDER.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {CHANNELS[channel].label}
                </SelectItem>
              ))}
            </FormSelect>
          </Field>
          {draft.kind === "income" && (
            <Field id="entry-status" label={t.forms.entry.status}>
              <FormSelect id="entry-status" value={draft.status} onChange={(value) => set("status", value as EntryStatus)}>
                <SelectItem value="received">{t.forms.entry.statusReceived}</SelectItem>
                <SelectItem value="pending">{t.forms.entry.statusPending}</SelectItem>
                {entry?.status === "refunded" && <SelectItem value="refunded">{t.forms.entry.statusRefunded}</SelectItem>}
              </FormSelect>
            </Field>
          )}
          {draft.kind === "income" && draft.status === "pending" && (
            <Field id="entry-expected" label={t.forms.entry.expected} error={errors.expectedOn}>
              <Input
                id="entry-expected"
                type="date"
                value={draft.expectedOn}
                aria-invalid={errors.expectedOn ? true : undefined}
                onChange={(event) => set("expectedOn", event.target.value)}
              />
            </Field>
          )}
        </div>
        <Field id="entry-note" label={t.forms.entry.note}>
          <Input
            id="entry-note"
            autoComplete="off"
            placeholder={draft.kind === "income" ? t.forms.entry.noteIncomePlaceholder : t.forms.entry.noteExpensePlaceholder}
            value={draft.note}
            onChange={(event) => set("note", event.target.value)}
          />
        </Field>
      </div>
      <DialogFooter className="border-t border-line px-4 py-3 sm:justify-between">
        {entry ? (
          <Button type="button" variant="ghost" className="text-bad hover:text-bad" onClick={() => setConfirmDelete(true)}>
            {t.words.delete}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={close}>
            {t.words.cancel}
          </Button>
          <Button type="submit">{entry ? t.words.save : t.forms.entry.submitNew}</Button>
        </div>
      </DialogFooter>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.forms.entry.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.forms.entry.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.words.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!entry) return
                deleteEntry(entry.id)
                close()
                if (useWorkbench.getState().lastSaveOk) toast.success(t.forms.entry.deleted)
              }}
            >
              {t.words.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

/** 记一笔 / 改一笔收支 */
export function EntryFormDialog() {
  const t = useT()
  const form = useUi((state) => state.entryForm)
  const close = useUi((state) => state.closeEntryForm)
  const ledger = useWorkbench((state) => state.ledger)
  const entry = form?.mode === "edit" ? (ledger.find((item) => item.id === form.entryId) ?? null) : null
  const key = form ? (form.mode === "edit" ? `edit-${form.entryId}` : `create-${JSON.stringify(form.preset ?? {})}`) : "none"

  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[480px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>{entry ? t.forms.entry.editTitle : t.forms.entry.newTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.forms.entry.description}</DialogDescription>
        </DialogHeader>
        {form && <Body key={key} form={form} entry={entry} />}
      </DialogContent>
    </Dialog>
  )
}
