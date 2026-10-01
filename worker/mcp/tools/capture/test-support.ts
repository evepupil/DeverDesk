import { createClock } from "../../clock"
import { createMemoryDataSource, type MemoryDataSourceOptions } from "../../data/memory"
import type { ToolContext } from "../../types"
import { emptyWorkbench } from "./helpers"

export const CAPTURE_NOW = Date.parse("2026-10-02T04:00:00.000Z")

export function captureContext(
  data = emptyWorkbench(),
  options: MemoryDataSourceOptions = {},
  idFactory?: (prefix: string, index: number) => string
): ToolContext {
  let id = 0
  return {
    data: createMemoryDataSource(data, options),
    clock: createClock("Asia/Shanghai", CAPTURE_NOW),
    token: { id: "token-test", name: "Capture tests", tier: "write" },
    newId(prefix) {
      const current = id++
      return idFactory ? idFactory(prefix, current) : `${prefix}-capture-${current}`
    },
  }
}
