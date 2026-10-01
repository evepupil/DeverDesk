export type ConnectClient = "claudeCode" | "codex" | "cursor" | "vscode" | "other"

export type ConnectSnippets = Record<ConnectClient, string>

function quoteCommandValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function json(value: object): string {
  return JSON.stringify(value, null, 2)
}

/** Build ready-to-paste MCP settings for supported clients. */
export function buildSnippets(url: string, token: string): ConnectSnippets {
  const authorization = `Bearer ${token}`
  const claudeHeader = quoteCommandValue(`Authorization: ${authorization}`)
  const tomlUrl = JSON.stringify(url)
  const tomlHeader = JSON.stringify(authorization)

  return {
    claudeCode: `claude mcp add --transport http deverdesk ${url} --header ${claudeHeader}`,
    codex: [
      "[mcp_servers.deverdesk]",
      `url = ${tomlUrl}`,
      `http_headers = { "Authorization" = ${tomlHeader} }`,
    ].join("\n"),
    cursor: json({
      mcpServers: {
        deverdesk: { url, headers: { Authorization: authorization } },
      },
    }),
    vscode: json({
      servers: {
        deverdesk: { type: "http", url, headers: { Authorization: authorization } },
      },
    }),
    other: `${url}\nAuthorization: ${authorization}`,
  }
}
