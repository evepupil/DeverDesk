import { describe, expect, it } from "vitest"

import { buildDevRewrites } from "../next.config"

describe("buildDevRewrites", () => {
  it("proxies API, MCP and OAuth paths to the local Worker in development", () => {
    expect(buildDevRewrites("http://127.0.0.1:8787", "development")).toEqual([
      { source: "/api/:path*", destination: "http://127.0.0.1:8787/api/:path*" },
      { source: "/mcp/:path*", destination: "http://127.0.0.1:8787/mcp/:path*" },
      { source: "/oauth/:path*", destination: "http://127.0.0.1:8787/oauth/:path*" },
      { source: "/.well-known/:path*", destination: "http://127.0.0.1:8787/.well-known/:path*" },
    ])
  })

  it("does not add rewrites outside development or without a Worker URL", () => {
    expect(buildDevRewrites("http://127.0.0.1:8787", "production")).toEqual([])
    expect(buildDevRewrites("http://127.0.0.1:8787", "test")).toEqual([])
    expect(buildDevRewrites(undefined, "development")).toEqual([])
  })
})
