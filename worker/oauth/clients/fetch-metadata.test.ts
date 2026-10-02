import { describe, expect, it, vi } from "vitest"
import { createTestD1 } from "../../testing/d1-sqlite.mjs"
import { fetchClientMetadata, MAX_METADATA_BYTES } from "./fetch-metadata"
import { resolveClient } from "./resolve"
import type { Fetcher } from "./types"

const ID = "https://vscode.dev/oauth/client-metadata.json"
// 2026-10-02 本机读到的 VS Code 身份说明
const VSCODE = {
  client_name: "Visual Studio Code",
  grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  application_type: "native",
  client_id: ID,
  client_uri: "https://vscode.dev/product",
  redirect_uris: ["http://127.0.0.1:33418/", "https://vscode.dev/redirect"],
}

function responding(response: () => Response): Fetcher & { mock: { calls: unknown[][] } } {
  return vi.fn(async () => response()) as unknown as Fetcher & { mock: { calls: unknown[][] } }
}

describe("读身份说明", () => {
  it("读到 VS Code 的说明；不跟随跳转、带超时", async () => {
    const fetcher = responding(() => Response.json(VSCODE))
    expect(await fetchClientMetadata(ID, fetcher)).toEqual({
      clientId: ID,
      name: "Visual Studio Code",
      redirectUris: ["http://127.0.0.1:33418/", "https://vscode.dev/redirect"],
    })
    const init = fetcher.mock.calls[0]![1] as RequestInit
    expect(init.redirect).toBe("manual")
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("跳转、非 200、超过 5 KB、不是 JSON、连不上都算读不到", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const redirect = responding(() => new Response(null, { status: 302, headers: { Location: "https://evil.example/doc.json" } }))
    expect(await fetchClientMetadata(ID, redirect)).toBeNull()
    expect(await fetchClientMetadata(ID, responding(() => new Response("blocked", { status: 403 })))).toBeNull()
    const huge = JSON.stringify({ ...VSCODE, padding: "x".repeat(MAX_METADATA_BYTES) })
    expect(await fetchClientMetadata(ID, responding(() => new Response(huge)))).toBeNull()
    expect(await fetchClientMetadata(ID, responding(() => new Response("<html>")))).toBeNull()
    expect(await fetchClientMetadata(ID, async () => { throw new TypeError("network") })).toBeNull()
  })
})

describe("按编号认客户端", () => {
  it("网址编号：读到就用读到的；读不到查内置名单；名单里也没有就报读不到", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const db = createTestD1()
    const unreachable: Fetcher = async () => { throw new TypeError("network") }
    expect(await resolveClient(db, ID, responding(() => Response.json({ ...VSCODE, client_name: "VS Code Insiders" }))))
      .toMatchObject({ ok: true, client: { name: "VS Code Insiders", source: "metadata" } })
    expect(await resolveClient(db, ID, unreachable))
      .toMatchObject({ ok: true, client: { name: "Visual Studio Code", source: "known" } })
    expect(await resolveClient(db, "https://unknown.example/client.json", unreachable))
      .toEqual({ ok: false, reason: "metadata_unavailable" })
  })

  it("格式不对的编号不去读", async () => {
    const db = createTestD1()
    const fetcher = responding(() => Response.json(VSCODE))
    expect(await resolveClient(db, "https://127.0.0.1/client.json", fetcher)).toEqual({ ok: false, reason: "client_id" })
    expect(await resolveClient(db, "my-client", fetcher)).toEqual({ ok: false, reason: "client_id" })
    expect(await resolveClient(db, "", fetcher)).toEqual({ ok: false, reason: "client_id" })
    expect(fetcher.mock.calls).toHaveLength(0)
  })
})
