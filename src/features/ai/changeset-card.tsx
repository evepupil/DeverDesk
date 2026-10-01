"use client"

import { cn } from "cn"
import { ChevronDown, Pencil, Plus, Trash2, Undo2, type LucideIcon } from "lucide-react"
import { useState } from "react"

import { IconButton } from "@/components/base/icon-button"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/react"
import { useWorkbench } from "@/state/store"
import type { AiChange, AiChangeset, ChangeAction } from "@/sync/protocol"
import { fieldChanges, recordLabel, summarize, type FieldValue } from "./describe"
import { formatActivityTime, recordLabelText, summaryText } from "./activity-text"
import { useChangesetAction } from "./use-changeset-action"

const ACTION_ICON: Record<ChangeAction, LucideIcon> = { create: Plus, update: Pencil, delete: Trash2 }

function valueText(value: FieldValue, t: ReturnType<typeof useT>): string {
  if (typeof value === "string") return value
  if (value.type === "none") return t.ai.values.none
  if (value.type === "deletedProject") return t.ai.values.deletedProject
  if (value.type === "deletedTask") return t.ai.values.deletedTask
  if (value.type === "direction") return t.ai.values[value.value]
  return t.ai.values.none
}

function ChangeRow({ change, disabled, onUndo }: {
  change: AiChange
  disabled: boolean
  onUndo(seq: number): void
}) {
  const t = useT()
  const tasks = useWorkbench((state) => state.tasks)
  const Icon = ACTION_ICON[change.action]
  const record = change.action === "delete" ? change.before : change.after ?? change.before
  const label = recordLabel(change.kind, record)
  const name = recordLabelText(label, { record: t.ai.record })
  const projects = useWorkbench((state) => state.projects)
  const fields = change.action === "update" ? fieldChanges(change.kind, change.before, change.after, projects, tasks) : []

  return (
    <li className="flex min-w-0 items-start gap-2 border-t border-line py-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-1.5 text-xs">
          <span className="shrink-0 text-fg-2">{t.ai.kinds[change.kind]}</span>
          <span className="text-fg-3" aria-hidden>·</span>
          <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
          {change.state === "applied" && (
            <IconButton
              label={t.ai.undoOne}
              size="icon-xs"
              disabled={disabled}
              onClick={() => onUndo(change.seq)}
              className="-mt-1 text-fg-3"
            >
              <Undo2 />
            </IconButton>
          )}
        </div>
        {change.state === "conflict" && <p className="mt-1 text-xs text-fg-3">{t.ai.changeConflict}</p>}
        {fields.length > 0 && (
          <dl className="mt-1 grid gap-x-2 gap-y-0.5 text-xs sm:grid-cols-[max-content_minmax(0,1fr)]">
            {fields.map((item) => (
              <div key={item.field} className="grid min-w-0 grid-cols-subgrid sm:col-span-2">
                <dt className="text-fg-3">{t.ai.fields[item.field]}</dt>
                <dd className="min-w-0 truncate text-fg-2" title={`${valueText(item.before, t)} → ${valueText(item.after, t)}`}>
                  {valueText(item.before, t)} → {valueText(item.after, t)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  )
}

export function ChangesetCard({ changeset }: { changeset: AiChangeset }) {
  const t = useT()
  const { busy, run } = useChangesetAction()
  const [expanded, setExpanded] = useState(false)
  const summary = summaryText(summarize(changeset), t.ai)
  const loadingLabel = busy === "accept" ? t.ai.accepting : busy === "reject" ? t.ai.rejecting : t.ai.undoing

  return (
    <article className="min-w-0 rounded-md border border-line bg-card px-3 py-2.5 shadow-xs">
      <header className="flex min-w-0 items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium text-fg" title={changeset.clientName}>{changeset.clientName}</span>
        <span className="shrink-0 text-fg-3">{formatActivityTime(changeset.createdAt)}</span>
        <span className="shrink-0 text-fg-2">{t.ai.status[changeset.status]}</span>
      </header>
      <p className="mt-1 truncate text-sm text-fg" title={summary}>{summary}</p>
      {changeset.reason && <p className="mt-1 line-clamp-2 text-xs text-fg-2">{changeset.reason}</p>}
      <Button variant="ghost" size="xs" onClick={() => setExpanded((open) => !open)} className="mt-1 -ml-1 text-fg-2">
        <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
        {t.ai.details}
      </Button>
      {expanded && (
        <ul className="mt-1">
          {changeset.changes.map((change) => (
            <ChangeRow
              key={change.seq}
              change={change}
              disabled={busy !== null}
              onUndo={(seq) => void run("undo", changeset.id, [seq])}
            />
          ))}
        </ul>
      )}
      {(changeset.status === "proposed" || (changeset.status === "applied" && changeset.changes.some((change) => change.state === "applied"))) && (
        <footer className="mt-2 flex justify-end gap-1.5 border-t border-line pt-2">
          {changeset.status === "proposed" ? (
            <>
              <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void run("reject", changeset.id)}>
                {busy === "reject" ? loadingLabel : t.ai.reject}
              </Button>
              <Button variant="default" size="sm" disabled={busy !== null} onClick={() => void run("accept", changeset.id)}>
                {busy === "accept" ? loadingLabel : t.ai.accept}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run("undo", changeset.id)}>
              <Undo2 />
              {busy ? loadingLabel : t.ai.undo}
            </Button>
          )}
        </footer>
      )}
    </article>
  )
}
