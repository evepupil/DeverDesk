// manage_changes：确认预览、撤销自己的改动或撤回提议。
import type { ChangesTool } from "../../types"
import { ToolInputError } from "../../types"
import type { TokenTier } from "../../../../src/sync/protocol"

interface ManageChangesInput {
  action: "confirm" | "undo" | "withdraw"
  changesetId?: string
  seqs?: number[]
}

function isInput(value: unknown): value is ManageChangesInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (input.action !== "confirm" && input.action !== "undo" && input.action !== "withdraw") return false
  if (input.changesetId !== undefined && typeof input.changesetId !== "string") return false
  if (input.seqs !== undefined && (!Array.isArray(input.seqs) || input.seqs.length > 20 ||
      input.seqs.some((seq) => !Number.isSafeInteger(seq) || (seq as number) < 0))) return false
  return true
}

function requiredTier(action: ManageChangesInput["action"]): TokenTier {
  return action === "withdraw" ? "propose" : "write"
}

export const manageChangesTool: ChangesTool<unknown> = {
  kind: "changes",
  name: "manage_changes",
  title: "Manage changes",
  description: "Manage your changesets by confirming previews, undoing applied changes, or withdrawing proposals. Use this after reviewing a preview or when you need to reverse or withdraw your own changes; changes may be queued for the user's approval.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["confirm", "undo", "withdraw"] },
      changesetId: { type: "string", minLength: 1 },
      seqs: { type: "array", items: { type: "integer", minimum: 0 }, maxItems: 20 },
    },
    required: ["action"],
    additionalProperties: false,
  },
  async run(ctx, changesets, value) {
    if (!isInput(value)) throw new ToolInputError("Provide a valid action, changesetId, and optional seqs.")
    if (ctx.token.tier !== requiredTier(value.action)) {
      throw new ToolInputError(value.action === "withdraw"
        ? "Withdrawing a proposal requires a propose-tier token."
        : "Confirming or undoing changes requires a write-tier token.")
    }
    const result = value.action === "confirm"
      ? await changesets.confirm(ctx.token, value.changesetId)
      : value.action === "undo"
        ? await changesets.undo(ctx.token, value.changesetId, value.seqs)
        : await changesets.withdraw(ctx.token, value.changesetId)
    const applied = result.changeset.changes.filter((change) => change.state === "applied").length
    const undone = result.changeset.changes.filter((change) => change.state === "undone").length
    const message = result.conflicts.length > 0
      ? "Some changes conflicted and were skipped. Review the conflict sequence numbers."
      : value.action === "confirm"
        ? "Preview confirmed."
        : value.action === "undo"
          ? "Changeset undo completed."
          : "Proposal withdrawn."
    return {
      changesetId: result.changeset.id,
      status: result.changeset.status,
      applied,
      undone,
      conflicts: result.conflicts,
      message,
    }
  },
}
