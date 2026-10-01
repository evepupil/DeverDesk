import { describe, expect, it } from "vitest"

import { buildDevRewrites } from "../next.config"

describe("buildDevRewrites", () => {
  it("proxies both API and MCP paths to the local Worker in development", () => {
    expect(buildDevRewrites("http://127.0.0.1:8787", "development")).toEqual([
      { source: "/api/:path*", destination: "http://127.0.0.1:8787/api/:path*" },
      { source: "/mcp/:path*", destination: "http://127.0.0.1:8787/mcp/:path*" },
    ])
  })

  it("does not add rewrites outside development or without a Worker URL", () => {
    expect(buildDevRewrites("http://127.0.0.1:8787", "production")).toEqual([])
    expect(buildDevRewrites("http://127.0.0.1:8787", "test")).toEqual([])
    expect(buildDevRewrites(undefined, "development")).toEqual([])
  })
})
