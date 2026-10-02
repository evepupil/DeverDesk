import { describe, expect, it } from "vitest"

import { buildSnippets } from "./connect-snippets"

describe("buildSnippets", () => {
  const url = "https://desk.example/mcp"
  const token = "dd_test-token"

  it("builds ready-to-paste config for all clients", () => {
    const snippets = buildSnippets(url, token)

    expect(snippets.claudeCode).toBe(
      'claude mcp add --transport http deverdesk https://desk.example/mcp --header "Authorization: Bearer dd_test-token"'
    )
    expect(snippets.codex.split("\n")).toEqual([
      "[mcp_servers.deverdesk]",
      'url = "https://desk.example/mcp"',
      'http_headers = { "Authorization" = "Bearer dd_test-token" }',
    ])

    const cursor = JSON.parse(snippets.cursor) as {
      mcpServers: { deverdesk: { url: string; headers: { Authorization: string } } }
    }
    expect(cursor).toEqual({ mcpServers: { deverdesk: { url, headers: { Authorization: `Bearer ${token}` } } } })
    expect(snippets.cursor).toBe(JSON.stringify(cursor, null, 2))

    const vscode = JSON.parse(snippets.vscode) as {
      servers: { deverdesk: { type: string; url: string; headers: { Authorization: string } } }
    }
    expect(vscode).toEqual({ servers: { deverdesk: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } })
    expect(snippets.vscode).toBe(JSON.stringify(vscode, null, 2))

    expect(snippets.other.split("\n")).toEqual([url, `Authorization: Bearer ${token}`])
    expect(snippets.recorder).toBe([
      "claude plugin marketplace add evepupil/DeverDesk",
      "claude plugin install deverdesk@deverdesk --config server_url=https://desk.example --config token=dd_test-token",
      "",
      "node deverdesk-recorder setup --url https://desk.example --token dd_test-token --install-codex-hooks",
    ].join("\n"))
  })

  it("escapes header argument values", () => {
    const snippets = buildSnippets("https://desk.example/mcp", 'token\\"value')
    expect(snippets.claudeCode).toBe(
      'claude mcp add --transport http deverdesk https://desk.example/mcp --header "Authorization: Bearer token\\\\\\"value"'
    )
  })
})
