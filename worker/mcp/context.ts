import type { McpDependencies } from "./deps"
import type { TokenIdentity, ToolContext } from "./types"
import type { WorkerEnv } from "../types"

export async function createToolContext(
  dependencies: McpDependencies,
  env: WorkerEnv,
  token: TokenIdentity,
): Promise<ToolContext> {
  const data = dependencies.createDataSource(env.DB)
  const profile = await data.profile()
  const now = dependencies.now()
  return {
    data,
    clock: dependencies.createClock(profile.value?.timeZone, now),
    token,
    newId: dependencies.newId,
  }
}
