import { describe, expect, it, vi } from "vitest"
import { MAX_CHANGES_PER_CALL, type SubmitInput, type SubmitResult } from "./types"
import {
  ChangesetError,
  FIXED_NOW,
  clockFactory,
  createService,
  dependencies,
  fixedClock,
  installMcpTestHooks,
  legacyRequest,
  resultOf,
  send,
  submit,
  testTokens,
} from "./test-support"

installMcpTestHooks()

describe("MCP tool permissions and execution", () => {
  it("filters tools by token tier and carries identity into tool context", async () => {
    for (const [tier, expected] of [
      ["read", ["get_day"]],
      ["propose", ["get_day", "add_tasks", "delete_records", "manage_changes"]],
      ["write", ["get_day", "add_tasks", "delete_records", "manage_changes"]],
    ] as const) {
      const { body } = await send(legacyRequest(testTokens()[tier], {
        jsonrpc: "2.0", id: 1, method: "tools/list", params: {},
      }))
      expect((resultOf(body).tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual(expected)
    }

    const { body } = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "get_day", arguments: {} },
    }))
    const result = resultOf(body)
    expect(result.structuredContent).toEqual({
      date: fixedClock.today,
      timeZone: "Asia/Shanghai",
      token: expect.objectContaining({ name: "Write client", tier: "write" }),
      generatedId: "test-injected",
    })
    expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toEqual(result.structuredContent)
    expect(clockFactory).toHaveBeenCalledWith("Asia/Shanghai", FIXED_NOW)
  })

  it("marks read-only and destructive behavior in MCP tool annotations", async () => {
    const { body } = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0", id: 3, method: "tools/list", params: {},
    }))
    const tools = resultOf(body).tools as Array<{ name: string; annotations: Record<string, unknown> }>
    expect(tools.find((tool) => tool.name === "get_day")?.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    })
    expect(tools.find((tool) => tool.name === "add_tasks")?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    })
    expect(tools.find((tool) => tool.name === "delete_records")?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    })
  })

  it("validates JSON Schema inputs and returns typed tool errors as isError", async () => {
    const invalidShape = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "add_tasks", arguments: { count: "many" } },
    }))
    expect(resultOf(invalidShape.body).isError).toBe(true)

    const crossFieldError = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "get_day", arguments: { issue: "bad" } },
    }))
    expect(resultOf(crossFieldError.body).isError).toBe(true)
    expect(resultOf(crossFieldError.body).structuredContent).toEqual({
      error: "The requested date is outside the supported range.",
    })
  })

  it("wraps applied, proposed, preview, destructive, and no-change writes", async () => {
    const callWrite = (token: string, name: string, count: number) => send(legacyRequest(token, {
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: { name, arguments: { count } },
    }))

    const applied = resultOf((await callWrite(testTokens().write, "add_tasks", 2)).body)
    expect(applied.structuredContent).toMatchObject({
      created: 2,
      warnings: ["A possible duplicate was skipped."],
      changeset: { id: "cs-test", status: "applied", applied: 2, conflicts: [], message: "The changes were applied." },
    })
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({
      token: expect.objectContaining({ tier: "write" }), forcePreview: false,
    }))

    const proposed = resultOf((await callWrite(testTokens().propose, "add_tasks", 2)).body)
    expect(proposed.structuredContent).toMatchObject({ changeset: { status: "proposed", applied: 0 } })

    const preview = resultOf((await callWrite(testTokens().write, "add_tasks", 11)).body)
    expect(preview.structuredContent).toMatchObject({ changeset: { status: "preview", applied: 0 } })
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ forcePreview: true }))

    const deletePreview = resultOf((await callWrite(testTokens().write, "delete_records", 1)).body)
    expect(deletePreview.structuredContent).toMatchObject({ changeset: { status: "preview" } })
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ forcePreview: true }))

    const noChange = resultOf((await callWrite(testTokens().write, "add_tasks", 0)).body)
    expect(noChange.structuredContent).toMatchObject({ changeset: { id: null, status: "no_change", applied: 0 } })
  })

  it("reports changes rejected by conflicts and partial application accurately", async () => {
    const dependenciesFor = (appliedSequences: readonly number[], conflicts: number[]) => {
      const conflictService = createService(async (input: SubmitInput): Promise<SubmitResult> => ({
        changesetId: "cs-conflicted",
        status: "applied",
        results: input.changes.map((change, seq) => ({
          seq,
          kind: change.kind,
          id: change.id,
          state: appliedSequences.includes(seq) ? "applied" : "conflict",
          after: appliedSequences.includes(seq) ? change.after : null,
        })),
        conflicts,
      }))
      return { ...dependencies, createChangesetService: () => conflictService }
    }
    const callWrite = (
      id: number,
      callDependencies: ReturnType<typeof dependenciesFor>,
      count = 2,
    ) => send(
      legacyRequest(testTokens().write, {
        jsonrpc: "2.0", id, method: "tools/call",
        params: { name: "add_tasks", arguments: { count } },
      }),
      callDependencies,
    )

    const noneApplied = resultOf((await callWrite(11, dependenciesFor([], [0, 1]))).body)
    expect(noneApplied.structuredContent).toMatchObject({
      changeset: {
        status: "applied",
        applied: 0,
        conflicts: [0, 1],
        message: "No changes were applied because the records changed while this request was running. Re-read the affected records and try again.",
      },
    })

    const partiallyApplied = resultOf((await callWrite(12, dependenciesFor([0], [1]))).body)
    expect(partiallyApplied.structuredContent).toMatchObject({
      changeset: {
        status: "applied",
        applied: 1,
        conflicts: [1],
        message: "1 change was applied; 1 change was skipped because the records changed while this request was running. Re-read the affected records before retrying.",
      },
    })

    const partiallyAppliedMany = resultOf((await callWrite(13, dependenciesFor([0, 1], [2, 3]), 4)).body)
    expect(partiallyAppliedMany.structuredContent).toMatchObject({
      changeset: {
        status: "applied",
        applied: 2,
        conflicts: [2, 3],
        message: "2 changes were applied; 2 changes were skipped because the records changed while this request was running. Re-read the affected records before retrying.",
      },
    })
  })

  it("enforces the per-call change cap and describes rate limits in minutes", async () => {
    const tooMany = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0", id: 7, method: "tools/call",
      params: { name: "add_tasks", arguments: { count: MAX_CHANGES_PER_CALL + 1 } },
    }))
    expect(resultOf(tooMany.body).isError).toBe(true)
    expect(resultOf(tooMany.body).structuredContent).toEqual({
      error: `This tool can change at most ${MAX_CHANGES_PER_CALL} records per call.`,
    })

    const limitedService = createService(async () => {
      throw new ChangesetError("rate_limited", "Too many changes.", 125)
    })
    const limited = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0", id: 8, method: "tools/call",
      params: { name: "add_tasks", arguments: { count: 1 } },
    }), { ...dependencies, createChangesetService: () => limitedService })
    expect(resultOf(limited.body).isError).toBe(true)
    expect(resultOf(limited.body).structuredContent).toEqual({
      error: "Too many changes. Please wait about 3 minute(s) before trying again.",
    })
  })

  it("executes changes tools and hides unexpected server errors", async () => {
    const change = await send(legacyRequest(testTokens().propose, {
      jsonrpc: "2.0", id: 9, method: "tools/call",
      params: { name: "manage_changes", arguments: { action: "withdraw" } },
    }))
    expect(resultOf(change.body).structuredContent).toEqual({
      action: "withdraw", tokenId: expect.any(String),
    })

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const unexpected = await send(legacyRequest(testTokens().write, {
      jsonrpc: "2.0", id: 10, method: "tools/call",
      params: { name: "get_day", arguments: { issue: "unexpected" } },
    }))
    expect(resultOf(unexpected.body).isError).toBe(true)
    expect(resultOf(unexpected.body).structuredContent).toEqual({
      error: "The tool could not complete because of an unexpected server error.",
    })
    expect(error).toHaveBeenCalled()
  })
})
