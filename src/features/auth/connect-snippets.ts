import { MCP_PATH } from "@/sync/protocol"

export type ConnectClient = "claudeCode" | "codex" | "cursor" | "vscode" | "other" | "recorder"

export type ConnectSnippets = Record<ConnectClient, string>

function quoteCommandValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function json(value: object): string {
  return JSON.stringify(value, null, 2)
}

/** Build ready-to-paste MCP settings for supported clients. */
export function buildSnippets(url: string, token: string): ConnectSnippets {
  const origin = new URL(url).origin
  const mcpUrl = `${origin}${MCP_PATH}`
  const authorization = `Bearer ${token}`
  const claudeHeader = quoteCommandValue(`Authorization: ${authorization}`)
  const tomlUrl = JSON.stringify(mcpUrl)
  const tomlHeader = JSON.stringify(authorization)

  return {
    claudeCode: `claude mcp add --transport http deverdesk ${mcpUrl} --header ${claudeHeader}`,
    codex: [
      "[mcp_servers.deverdesk]",
      `url = ${tomlUrl}`,
      `http_headers = { "Authorization" = ${tomlHeader} }`,
    ].join("\n"),
    cursor: json({
      mcpServers: {
        deverdesk: { url: mcpUrl, headers: { Authorization: authorization } },
      },
    }),
    vscode: json({
      servers: {
        deverdesk: { type: "http", url: mcpUrl, headers: { Authorization: authorization } },
      },
    }),
    other: `${mcpUrl}\nAuthorization: ${authorization}`,
    recorder: [
      "claude plugin marketplace add evepupil/DeverDesk",
      "claude plugin install deverdesk@deverdesk",
      "",
      `deverdesk-recorder setup --url ${origin} --token ${token} --install-codex-hooks`,
    ].join("\n"),
  }
}
