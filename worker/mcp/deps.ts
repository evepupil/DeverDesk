import { createChangesetService } from "../ai/changesets"
import { randomBase64Url } from "../auth/crypto"
import { createClock } from "./clock"
import { createD1DataSource } from "./data/d1"
import { registeredTools } from "./registry"
import type { Clock, ChangesetService, DataSource, ToolDefinition } from "./types"

export interface McpDependencies {
  tools: readonly ToolDefinition[]
  createDataSource(db: D1Database): DataSource
  createClock(timeZone: string | undefined, now: number): Clock
  createChangesetService(db: D1Database, now: () => number): ChangesetService
  now(): number
  newId(prefix: string): string
}

export const productionMcpDependencies: McpDependencies = {
  tools: registeredTools,
  createDataSource: createD1DataSource,
  createClock,
  createChangesetService,
  now: Date.now,
  newId: (prefix) => `${prefix}-${randomBase64Url(12)}`,
}
