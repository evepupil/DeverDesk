import { describe, expect, it } from "vitest"
import { inputSchemaFor } from "./registry"
import type { ReadTool } from "./types"
import {
  installMcpTestHooks,
  legacyRequest,
  resultOf,
  send,
  testTokens,
  dependencies,
} from "./test-support"

installMcpTestHooks()

declare const process: { cpuUsage(previous?: { user: number; system: number }): { user: number; system: number } }

describe("MCP Node CPU benchmark", () => {
  it("measures cached JSON Schema SDK requests for 22 tools, 300 repetitions each", async () => {
    const tools: ReadTool<unknown>[] = Array.from({ length: 22 }, (_, index) => ({
      kind: "read",
      name: `bench_tool_${String(index).padStart(2, "0")}`,
      title: `Bench tool ${index}`,
      description: "Return a fixed benchmark value. Use it to measure MCP request overhead.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => ({ ok: true }),
    }))
    const benchDependencies = { ...dependencies, tools }
    for (const tool of tools) inputSchemaFor(tool)

    const list = await measureCpu(async () => {
      for (let index = 0; index < 300; index += 1) {
        const { response, body } = await send(legacyRequest(testTokens().write, {
          jsonrpc: "2.0", id: index, method: "tools/list", params: {},
        }), benchDependencies)
        expect(response.status).toBe(200)
        expect(resultOf(body).tools).toHaveLength(22)
      }
    })
    const initialize = await measureCpu(async () => {
      for (let index = 0; index < 300; index += 1) {
        const { response, body } = await send(legacyRequest(testTokens().write, {
          jsonrpc: "2.0", id: index, method: "initialize",
          params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "bench", version: "1" } },
        }), benchDependencies)
        expect(response.status).toBe(200)
        expect(resultOf(body).protocolVersion).toBe("2025-11-25")
      }
    })
    const toolCalls = await measureCpu(async () => {
      for (const tool of tools) {
        for (let index = 0; index < 300; index += 1) {
          const { response, body } = await send(legacyRequest(testTokens().write, {
            jsonrpc: "2.0", id: index, method: "tools/call",
            params: { name: tool.name, arguments: {} },
          }), benchDependencies)
          expect(response.status).toBe(200)
          expect(resultOf(body).isError).not.toBe(true)
        }
      }
    }, 22 * 300)

    console.log(`MCP Node CPU ms/request: tools/list=${list.toFixed(3)}, initialize=${initialize.toFixed(3)}, tools/call=${toolCalls.toFixed(3)} (22 tools x 300)`)
    expect(list).toBeLessThan(10)
    expect(initialize).toBeLessThan(10)
    expect(toolCalls).toBeLessThan(10)
  }, 120_000)
})

async function measureCpu(run: () => Promise<void>, requestCount = 300): Promise<number> {
  const start = process.cpuUsage()
  await run()
  const elapsed = process.cpuUsage(start)
  return (elapsed.user + elapsed.system) / 1000 / requestCount
}
