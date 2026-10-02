// 内置名单：常用 AI 应用的身份说明里写的名字和跳回地址。
// 只在读不到它们挂在官网上的身份说明时用（对方拦截云服务器、地区限制等），读得到一律以线上为准。
// 这些跳回地址要么在它们自家网站上，要么在用户本机，别人冒充编号也拿不到授权码。
// 2026-10-02 核对：ChatGPT、Codex、VS Code 的说明本机直接读到；Claude 两份按官方文档（本机连不上 claude.ai）。
import type { ClientMetadata } from "../rules/client-metadata"

export const KNOWN_CLIENTS: readonly ClientMetadata[] = [
  {
    clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
    name: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"],
  },
  {
    clientId: "https://claude.ai/oauth/claude-code-client-metadata",
    name: "Claude Code",
    redirectUris: ["http://localhost/callback", "http://127.0.0.1/callback"],
  },
  {
    clientId: "https://chatgpt.com/oauth/client.json",
    name: "ChatGPT",
    redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
  },
  {
    clientId: "https://chatgpt.com/oauth/codex/client.json",
    name: "Codex",
    redirectUris: ["http://127.0.0.1/callback", "http://localhost/callback"],
  },
  {
    clientId: "https://vscode.dev/oauth/client-metadata.json",
    name: "Visual Studio Code",
    redirectUris: ["http://127.0.0.1:33418/", "https://vscode.dev/redirect"],
  },
]

export function knownClient(clientId: string): ClientMetadata | null {
  return KNOWN_CLIENTS.find((client) => client.clientId === clientId) ?? null
}
