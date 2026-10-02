import { describe, expect, it, vi } from "vitest"
import { createClient, RecorderHttpError } from "./client"

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("recorder HTTP client", () => {
  it("sets auth headers and retries a server error with the specified delays", async () => {
    const calls: string[] = []
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      calls.push(String(input))
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer dd_test")
      expect(new Headers(init?.headers).get("user-agent")).toBe("deverdesk-recorder/0.1.0")
      return calls.length < 3 ? response(503, { message: "try later" }) : response(200, { bindings: [] })
    })
    const sleep = vi.fn(async () => undefined)
    const client = createClient({ url: "https://example.test/", token: "dd_test", fetch: fetcher, sleep })

    await expect(client.getBindings()).resolves.toEqual({ bindings: [] })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[500], [1500]])
    expect(calls[0]).toBe("https://example.test/api/recorder/bindings")
  })

  it("classifies authorization and validation errors without retrying", async () => {
    for (const [status, kind] of [[401, "auth"], [403, "forbidden"], [422, "invalid"]] as const) {
      const fetcher = vi.fn<typeof fetch>(async () => response(status, { message: "rejected" }))
      const client = createClient({ url: "https://example.test", token: "x", fetch: fetcher, sleep: async () => undefined })
      await expect(client.getBindings()).rejects.toMatchObject<Partial<RecorderHttpError>>({ status, kind, message: "rejected" })
      expect(fetcher).toHaveBeenCalledOnce()
    }
  })

  it("retries network errors and converts an exhausted abort timeout to a network error", async () => {
    const network = vi.fn<typeof fetch>(async () => { throw new Error("offline") })
    const client = createClient({ url: "https://example.test", token: "x", fetch: network, sleep: async () => undefined })
    await expect(client.getBindings()).rejects.toMatchObject({ status: 0, kind: "network" })
    expect(network).toHaveBeenCalledTimes(3)

    const timeoutFetch = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
    }))
    const timeoutClient = createClient({ url: "https://example.test", token: "x", fetch: timeoutFetch, timeoutMs: 1, sleep: async () => undefined })
    await expect(timeoutClient.getBindings()).rejects.toMatchObject({ kind: "network", message: "连接服务器超时" })
    expect(timeoutFetch).toHaveBeenCalledTimes(3)
  })
})
