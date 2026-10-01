import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker"
import {
  fromJsonSchema,
  preloadSchemas,
  type JsonSchemaType,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server"
import { captureTools } from "./tools/capture"
import { changesTools } from "./tools/changes"
import { planTools } from "./tools/plan"
import { readTools } from "./tools/read"
import type { JsonSchema, TokenIdentity, ToolDefinition } from "./types"

preloadSchemas()

const jsonSchemaValidator = new CfWorkerJsonSchemaValidator()
const schemaCache = new Map<string, { source: JsonSchema; schema: StandardSchemaWithJSON<Record<string, unknown>> }>()

export const registeredTools: ToolDefinition[] = [
  ...readTools,
  ...captureTools,
  ...planTools,
  ...changesTools,
]

function compileToolSchema(tool: ToolDefinition): StandardSchemaWithJSON<Record<string, unknown>> {
  return fromJsonSchema<Record<string, unknown>>(tool.inputSchema as JsonSchemaType, jsonSchemaValidator)
}

function cacheToolSchema(tool: ToolDefinition): void {
  const cached = schemaCache.get(tool.name)
  if (cached?.source === tool.inputSchema) return
  schemaCache.set(tool.name, { source: tool.inputSchema, schema: compileToolSchema(tool) })
}

// Compile production schemas during module initialization, not once per request.
for (const tool of registeredTools) cacheToolSchema(tool)

export function inputSchemaFor(tool: ToolDefinition): StandardSchemaWithJSON<Record<string, unknown>> {
  cacheToolSchema(tool)
  return schemaCache.get(tool.name)!.schema
}

export function toolsForTier(tools: readonly ToolDefinition[], tier: TokenIdentity["tier"]): ToolDefinition[] {
  return tier === "read" ? tools.filter((tool) => tool.kind === "read") : [...tools]
}

const destructiveToolNames = new Set([
  "update_tasks",
  "reschedule",
  "manage_project",
  "manage_routine",
  "delete_records",
  "manage_changes",
])

export function isDestructiveTool(name: string): boolean {
  return destructiveToolNames.has(name)
}
