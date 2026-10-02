import {
  McpServer,
  type AuthInfo,
  type CallToolResult,
  type McpRequestContext,
} from "@modelcontextprotocol/server"
import { MAX_CHANGES_PER_CALL, PREVIEW_THRESHOLD, ChangesetError, ToolInputError } from "./types"
import { createToolContext } from "./context"
import { version as productVersion } from "../../package.json"
import type { McpDependencies } from "./deps"
import { MCP_INSTRUCTIONS } from "./instructions"
import { inputSchemaFor, isDestructiveTool, toolsForTier } from "./registry"
import type { TokenIdentity, ToolDefinition, WritePlan } from "./types"
import type { WorkerEnv } from "../types"

function isTokenIdentity(value: unknown): value is TokenIdentity {
  if (typeof value !== "object" || value === null) return false
  if (!("id" in value) || typeof value.id !== "string") return false
  if (!("name" in value) || typeof value.name !== "string") return false
  return "tier" in value && (value.tier === "read" || value.tier === "propose" || value.tier === "write")
}

function principalFrom(authInfo: AuthInfo | undefined): TokenIdentity {
  const principal = authInfo && "principal" in authInfo ? authInfo.principal : undefined
  if (!isTokenIdentity(principal)) throw new Error("Missing authenticated DeverDesk principal in MCP request context")
  return principal
}

export function createMcpServer(
  dependencies: McpDependencies,
  env: WorkerEnv,
  sdkContext: McpRequestContext,
): McpServer {
  const token = principalFrom(sdkContext.authInfo)
  const server = new McpServer(
    { name: "DeverDesk", version: productVersion },
    { instructions: MCP_INSTRUCTIONS },
  )

  for (const tool of toolsForTier(dependencies.tools, token.tier)) {
    registerToolExecutor(server, dependencies, env, token, tool)
  }
  return server
}

function registerToolExecutor(
  server: McpServer,
  dependencies: McpDependencies,
  env: WorkerEnv,
  token: TokenIdentity,
  tool: ToolDefinition,
): void {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: inputSchemaFor(tool),
      annotations: {
        readOnlyHint: tool.kind === "read",
        ...(tool.kind === "read" ? {} : { destructiveHint: isDestructiveTool(tool.name) }),
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const context = await createToolContext(dependencies, env, token)
        const output = await executeTool(tool, context, dependencies, env, input)
        return asToolResult(output)
      } catch (error) {
        if (error instanceof ToolInputError || error instanceof ChangesetError) {
          return asToolResult({ error: describeToolError(error) }, true)
        }
        console.error("MCP tool execution failed", tool.name, error)
        return asToolResult({ error: "The tool could not complete because of an unexpected server error." }, true)
      }
    },
  )
}

async function executeTool(
  tool: ToolDefinition,
  context: Awaited<ReturnType<typeof createToolContext>>,
  dependencies: McpDependencies,
  env: WorkerEnv,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (tool.kind === "read") return tool.run(context, input)
  if (tool.kind === "changes") {
    return tool.run(context, dependencies.createChangesetService(env.DB, dependencies.now), input)
  }
  return submitWriteTool(tool, context, dependencies, env, input)
}

async function submitWriteTool(
  tool: Extract<ToolDefinition, { kind: "write" }>,
  context: Awaited<ReturnType<typeof createToolContext>>,
  dependencies: McpDependencies,
  env: WorkerEnv,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const plan: WritePlan = await tool.plan(context, input)
  if (plan.changes.length > MAX_CHANGES_PER_CALL) {
    throw new ToolInputError(`This tool can change at most ${MAX_CHANGES_PER_CALL} records per call.`)
  }

  const changesets = dependencies.createChangesetService(env.DB, dependencies.now)
  const result = await changesets.submit({
    token: context.token,
    tool: tool.name,
    reason: plan.reason ?? null,
    changes: plan.changes,
    forcePreview: tool.alwaysPreview === true || plan.changes.length > PREVIEW_THRESHOLD,
  })
  const applied = result.results.filter((item) => item.state === "applied").length
  const presented = tool.present ? tool.present(context, plan, result) : plan.output
  return {
    ...presented,
    ...(plan.warnings?.length ? { warnings: plan.warnings } : {}),
    changeset: {
      id: result.changesetId,
      status: result.status,
      applied,
      conflicts: result.conflicts,
      message: changesetMessage(result.status, applied, result.conflicts.length),
    },
  }
}

function changesetMessage(
  status: "applied" | "proposed" | "preview" | "no_change",
  applied: number,
  conflicts: number,
): string {
  if (status === "applied" && conflicts > 0) {
    if (applied === 0) {
      return "No changes were applied because the records changed while this request was running. Re-read the affected records and try again."
    }
    const appliedCount = `${applied} change${applied === 1 ? " was" : "s were"} applied`
    const skippedCount = `${conflicts} change${conflicts === 1 ? " was" : "s were"} skipped`
    return `${appliedCount}; ${skippedCount} because the records changed while this request was running. Re-read the affected records before retrying.`
  }

  const messages = {
    applied: "The changes were applied.",
    proposed: "The changes are waiting for the user to approve them in DeverDesk's AI activity.",
    preview: "Show this preview to the user and confirm it with manage_changes after they agree.",
    no_change: "No changes were needed.",
  }
  const message = messages[status]
  return conflicts === 0 ? message : `${message} ${conflicts} change(s) conflicted with newer record versions.`
}

function describeToolError(error: ToolInputError | ChangesetError): string {
  if (error instanceof ChangesetError && error.code === "rate_limited") {
    const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60))
    return `${error.message} Please wait about ${minutes} minute(s) before trying again.`
  }
  return error.message
}

function asToolResult(output: Record<string, unknown>, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(output) }],
    structuredContent: output,
    ...(isError ? { isError: true } : {}),
  }
}
