"use client"


import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/react"
import type { AiChangeset } from "@/sync/protocol"
import { summaryText } from "./activity-text"
import { summarize } from "./describe"
import { openAiActivity } from "./use-ai-activity"
import { useChangesetAction } from "./use-changeset-action"

export function ProposalCard({ changeset, pendingCount }: { changeset: AiChangeset; pendingCount: number }) {
  const t = useT()
  const { busy, run } = useChangesetAction()
  const summary = summaryText(summarize(changeset), t.ai)
  const proposal = t.ai.proposal(changeset.clientName, summary)

  return (
    <section className="relative flex min-w-0 items-start gap-3 overflow-hidden rounded-md border border-line bg-card px-3 py-2.5 shadow-xs">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-progress" aria-hidden />
      <div className="min-w-0 flex-1 pl-1">
        <p className="line-clamp-2 text-sm text-fg" title={proposal}>{proposal}</p>
        {pendingCount > 1 && <p className="mt-0.5 text-xs text-fg-2">{t.ai.moreProposals(pendingCount - 1)}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void run("reject", changeset.id)}>
          {busy === "reject" ? t.ai.rejecting : t.ai.reject}
        </Button>
        <Button variant="default" size="sm" disabled={busy !== null} onClick={() => void run("accept", changeset.id)}>
          {busy === "accept" ? t.ai.accepting : t.ai.accept}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void openAiActivity("pending")} className="max-sm:px-1.5">
          {t.ai.view}
        </Button>
      </div>
    </section>
  )
}
