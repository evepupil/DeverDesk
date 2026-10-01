"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useT } from "@/i18n/react"
import { ApiFailure } from "@/lib/api"
import { performChangesetAction } from "./use-ai-activity"
import { isChangesetConflict } from "./activity-state"

export type ActivityAction = "accept" | "reject" | "undo"

export function useChangesetAction() {
  const t = useT()
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (action: ActivityAction, id: string, seqs?: number[]) => {
    if (busy) return
    const operation = seqs ? `undo:${seqs.join(",")}` : action
    setBusy(operation)
    try {
      const result = await performChangesetAction(action, id, seqs)
      const conflictCount = result.conflicts.length
      if (conflictCount > 0 && action === "accept") {
        toast.success(t.ai.toast.accepted, { description: t.ai.toast.acceptConflicts(conflictCount) })
      } else if (conflictCount > 0 && action === "undo") {
        toast.success(t.ai.toast.undone, { description: t.ai.toast.undoConflicts(conflictCount) })
      } else {
        toast.success(t.ai.toast[action === "accept" ? "accepted" : action === "reject" ? "rejected" : "undone"])
      }
    } catch (cause) {
      if (cause instanceof ApiFailure && isChangesetConflict(cause.status)) {
        toast.error(t.ai.toast.actionConflict)
      } else {
        toast.error(t.ai.toast.failed, { description: cause instanceof Error ? cause.message : undefined })
      }
    } finally {
      setBusy(null)
    }
  }

  return { busy, run }
}
