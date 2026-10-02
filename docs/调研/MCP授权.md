# 调研：MCP 的 OAuth 授权

- 状态：已定稿 · 最近更新：2026-10-02
- 用在：[OAuth 授权](../模块设计/OAuth授权.md)、[MCP 服务](../模块设计/MCP服务.md)、[登录与令牌](../模块设计/登录与令牌.md)
- 来源：2026-10-02 派出的三路侦察（规范、各家客户端、Cloudflare 现成库），结论按条带出处；身份说明文件是本机直接读到的。

## 一、规范要求（2026-07-28 版）

| 结论 | 出处 |
| --- | --- |
| 资源说明书（RFC 9728）必须列出至少一个授权方 `authorization_servers`；`resource` 必须和资源地址完全一致，即 `https://<域名>/mcp`（不带结尾斜杠） | [authorization-server-discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery)、[RFC 9728](https://www.rfc-editor.org/rfc/rfc9728.html) |
| 资源说明书放在 `/.well-known/oauth-protected-resource/mcp`（路径插在后面）；401 的 `WWW-Authenticate` 里带 `resource_metadata` 指过去，并且应当带 `scope`；客户端读不到指针时按「带路径 → 根路径」的顺序自己找 | 同上、[authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) |
| 授权方说明书（RFC 8414）放在 `/.well-known/oauth-authorization-server`，`issuer` 必须和拼出这个地址用的域名完全一致；没写 `code_challenge_methods_supported` 的，客户端必须拒绝继续，所以要写 `["S256"]` | [authorization-server-discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery)、[security-considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations) |
| 客户端认身份的顺序：预先登记 → 身份说明（客户端编号是一个 https 网址，授权方去读）→ 自助登记（RFC 7591）。新版把自助登记标成「不推荐」，但仍保留 | [client-registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)、[changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) |
| 读身份说明：编号必须是带路径的 https 网址；读回来的 `client_id` 必须和网址完全一致；跳回地址按文件里的核对；不跟随跳转、只认 200、读取上限约 5 KB、不缓存失败结果、不接受带密钥的认证方式、不去读本机和内网地址 | 同上、[CIMD 草案 -02](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-02) |
| 授权页必须清楚显示跳回地址的网站；跳回本机的应当额外提醒；名字是对方自己报的，不能当真 | [security-considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations) |
| PKCE（防授权码被截走的校验）只认 S256；客户端在授权和换令牌时都必须带 `resource`；服务端必须核对令牌是发给自己的 | [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) |
| 令牌只能放请求头，不能放网址里；令牌无效或过期一律 401；公开客户端的续期令牌必须轮换；授权码只能用一次，重复使用要拒绝并作废由它发出的令牌 | 同上、[OAuth 2.1 草案](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13) |
| 跳回地址必须精确匹配；只能是 https 或本机地址；本机地址可以换端口；跳回地址不对时显示错误页，不能跳 | [security-considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)、OAuth 2.1 草案 |
| 授权结果里应当带 `iss`（授权方是谁），并在说明书里写 `authorization_response_iss_parameter_supported: true`；以后的版本预计改成必须 | [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) |
| 授权页防被嵌入（`frame-ancestors 'none'` 或 `X-Frame-Options: DENY`）、防跨站提交 | [security best practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices) |
| 官方一致性测试（0.1.16）只有测客户端的授权场景，没有测服务端授权的场景 | 本机 `npx @modelcontextprotocol/conformance list --server` |

## 二、各家客户端

| 客户端 | 怎么认身份 | 跳回地址 | 要点 |
| --- | --- | --- | --- |
| Claude 网页版、桌面版、手机版 | 说明书里同时写了 `client_id_metadata_document_supported: true` 和 `none` 时走身份说明，否则走自助登记；也能手填客户端编号 | `https://claude.ai/api/mcp/auth_callback` | 收到 401 才开始授权；资源说明书的 `resource` 要等于用户填的地址；只用第一个授权方；401 时和过期前 5 分钟会自己续期；授权方列了 `offline_access` 就会带上；换令牌只发表单格式；每步 10 秒超时（续期 30 秒）；流量来自 160.79.104.0/21；免费版能加 1 个自定义连接器；手机上用网页版加好的 |
| ChatGPT（开发者模式） | 优先身份说明（`https://chatgpt.com/oauth/client.json`），授权方有登记接口时也能自助登记 | 授权方声明并返回 `iss` 时用 `https://chatgpt.com/connector_platform_oauth_redirect`，否则用带编号的地址 | 说明书里必须有 S256；`resource` 要绑进令牌；不支持固定令牌；Plus、Pro、Business、Enterprise、Education 的网页版可用；工具调用时的 401 不会弹「重新连接」 |
| Claude Code | 身份说明（`https://claude.ai/oauth/claude-code-client-metadata`）或自助登记 | `http://localhost:<随机端口>/callback` | 收到 401/403 自动开始；配了固定令牌被拒时直接报错，不会改走授权 |
| Codex | 身份说明（`https://chatgpt.com/oauth/codex/client.json`）或自助登记 | `http://127.0.0.1:<端口>/callback` | `codex mcp login <名字>`；配了固定令牌就不走授权 |
| Cursor | 自助登记 | `http://localhost:8787/callback`、`https://www.cursor.com/agents/mcp/oauth/callback` | 收到任何 401 都会开始授权；3.10 以后登记时还会带上 `cursor://anysphere.cursor-mcp/oauth/callback`，授权时用本机地址（论坛报告，安全评审时核对） |
| VS Code | 身份说明（`https://vscode.dev/oauth/client-metadata.json`）或自助登记 | `http://127.0.0.1:33418/`、`https://vscode.dev/redirect` | 收到 401/403 会读 `resource_metadata` 并改走授权 |

出处：[Claude 连接器认证](https://claude.com/docs/connectors/building/authentication)、[Claude 自定义连接器](https://claude.com/docs/connectors/custom/remote-mcp)、[按需授权](https://claude.com/docs/connectors/building/lazy-authentication)、[排错](https://claude.com/docs/connectors/building/troubleshooting)、[ChatGPT Apps SDK 认证](https://developers.openai.com/apps-sdk/build/auth)、[ChatGPT 开发者模式](https://developers.openai.com/api/docs/guides/developer-mode)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Codex MCP](https://developers.openai.com/codex/mcp)、[Cursor MCP](https://cursor.com/docs/context/mcp)、[VS Code MCP](https://code.visualstudio.com/api/extension-guides/ai/mcp)。

本机直接读到的身份说明（2026-10-02）：

| 编号 | 名字 | 跳回地址 | 认证方式 |
| --- | --- | --- | --- |
| `https://chatgpt.com/oauth/client.json` | ChatGPT | `https://chatgpt.com/connector_platform_oauth_redirect` | 声明 `private_key_jwt`，同时列出支持 `none` |
| `https://chatgpt.com/oauth/codex/client.json` | Codex | `http://127.0.0.1/callback`、`http://localhost/callback`（不带端口） | `none` |
| `https://vscode.dev/oauth/client-metadata.json` | Visual Studio Code | `http://127.0.0.1:33418/`、`https://vscode.dev/redirect` | `none` |
| `https://claude.ai/oauth/...` 两份 | — | — | 本机连不上 claude.ai；有人报告从云服务器读会被拦（[claude-code#84263](https://github.com/anthropics/claude-code/issues/84263)） |

## 三、Cloudflare 现成库 `@cloudflare/workers-oauth-provider`

| 结论 | 出处 |
| --- | --- |
| 最新 1.2.1（2026-09-28）；1.0.0 在 2026-09-24 才发布，1.2.0 去掉 plain PKCE 后出过一次让 Cursor 登记失败的回归 | [npm](https://registry.npmjs.org/@cloudflare/workers-oauth-provider)、[仓库](https://github.com/cloudflare/workers-oauth-provider) |
| 功能齐全：只认 S256、自助登记、身份说明（要开 `global_fetch_strictly_public`）、令牌绑资源、两份说明书、注销、续期令牌轮换（上一张在新的第一次使用前仍有效） | 仓库 README、docs/authorization-server.md |
| 数据只能存 KV（绑定名 `OAUTH_KV`），没有 D1 或自定义存储 | README、源码 |
| KV 改动最长要 60 秒以上才全球可见，断开连接后旧令牌还能用一阵；注销靠 `list()` 找令牌，可能漏掉刚发的，最坏活到过期（1 小时） | [KV 工作方式](https://developers.cloudflare.com/kv/concepts/how-kv-works/)、源码 |
| KV 免费额度每天 1000 次写入；续期一次写 2 次 | [KV 价格](https://developers.cloudflare.com/kv/platform/pricing/)、源码 |
| 历史漏洞：授权时没核对跳回地址（CVE-2025-4143）、PKCE 能被降级绕过（CVE-2025-4144）；更新日志里还修过 `completeAuthorization` 的开放跳转、`javascript:` 跳回地址 | [安全公告](https://github.com/cloudflare/workers-oauth-provider/security/advisories)、更新日志 |
| 别的方案：OpenAuth 基本停更、不支持身份说明和自助登记；Better Auth 的 MCP 插件要自带一套表，偏重 | [OpenAuth](https://github.com/openauthjs/openauth)、[Better Auth MCP](https://www.better-auth.com/docs/plugins/mcp) |

结论：自己在 D1 上实现（用户 2026-10-02 拍板）。断开连接立即生效；和手动令牌同一个列表、同一套权限和改动归属；不用多建 KV。上面这几个历史漏洞逐条写成测试。

## 四、官方 SDK 能帮上的

`@modelcontextprotocol/server` 2.2.0 只带资源方这一半：校验 Bearer 令牌（`requireBearerAuth`，要求令牌有过期时间）、生成资源说明书（`buildOAuthProtectedResourceMetadata`）、发两份说明书（`oauthMetadataResponse`）。授权方那一半（登记、授权页、发令牌、续期）没有，按文档说明要自己做或另找库。`@modelcontextprotocol/client` 2.2.0 带完整的客户端授权流程，端到端核对用它当「守规矩的客户端」。
