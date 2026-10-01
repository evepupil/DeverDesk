# 调研：MCP 协议、官方 SDK 与客户端接法

- 状态：已定稿 · 最近更新：2026-10-01
- 用在：[MCP 服务](../模块设计/MCP服务.md)、[AI 改动记录](../模块设计/AI改动记录.md)、[登录与令牌](../模块设计/登录与令牌.md)
- 来源：2026-10-01 派出的六路侦察，结论按条带出处；原始回报在 fleet 看板（任务 wkhkxv、wfrdwu、wsmfaj、wfsfg9）。

## 一、协议现状（2026-07-28 新版 + 老版本兼容）

| 结论 | 出处 |
| --- | --- |
| 2026-07-28 版去掉了 initialize 握手和会话编号，每个请求自带协议版本和客户端能力（放在请求的 `_meta` 里），任何一台服务器都能接任何一个请求——正适合 Worker | [versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)、[changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) |
| 新版必须实现 `server/discover`（返回支持的版本、能力、服务名、使用说明）；所有结果带 `resultType`；工具列表结果必须带缓存提示 `ttlMs`、`cacheScope` | [discover](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)、[schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.json) |
| 新版请求头 `Mcp-Method`、`Mcp-Name` 必须和请求体一致，不一致回 400 + `-32020`；不支持的版本回 400 + `-32022`（带支持列表） | [streamable-http](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) |
| 老客户端（2025-06-18 / 2025-11-25）先发 `initialize`，服务端不发会话编号即为无状态；GET、DELETE 回 405；`ping` 回空结果；响应一律普通 JSON 合规 | [2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) |
| 工具业务出错用 `isError: true` 的正常结果（AI 能看到并自己改正），只有未知工具、参数格式不对才用协议错误 | [server/tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) |
| 工具输入定义根节点必须是 `type: "object"`，默认 JSON Schema 2020-12，`enum`、`default`、`oneOf` 都能用；工具名 1–128 个字符，只用字母数字和 `_ - .` | 同上 |
| 工具注解 `readOnlyHint`（默认否）、`destructiveHint`（默认是）、`idempotentHint`、`openWorldHint`（默认是）只是提示，客户端据此决定要不要先问用户 | 同上 |
| 需要用户当场确认时，新版用「多轮请求」：服务端回 `input_required` 加签过名的 `requestState`，客户端问完用户后带答案重发；客户端没声明支持就不能用 | [mrtr](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)、[elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation) |
| Origin 头存在且不是自己的域名时必须 403（防 DNS 重绑定）；没带 Origin 的非浏览器客户端放行。规范不管跨域（CORS） | [streamable-http](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) |
| 只用固定令牌时，失败回 401 + `WWW-Authenticate: Bearer`；做 OAuth 时还要提供 `/.well-known/oauth-protected-resource` | [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) |

## 二、官方 SDK 与 CPU 实测

| 结论 | 出处 |
| --- | --- |
| 官方 TypeScript SDK v2（`@modelcontextprotocol/server` 2.2.0，2026-09-28）实现了新版，同时兼容 2024-10-07～2025-11-25 的老客户端；v1（`@modelcontextprotocol/sdk`）只到 2025-11-25 | [SDK v2 文档](https://ts.sdk.modelcontextprotocol.io/v2/)、[protocol-versions](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions) |
| `createMcpHandler(工厂)` 返回一个处理请求的对象，按 Web 标准的 Request/Response 工作，能直接跑在 Worker 里，不需要 Durable Objects；工厂每个请求跑一次 | [web-standard](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html) |
| SDK 自带给 Worker 用的输入校验器（Worker 不允许运行时生成代码，常见的 ajv 用不了）；`preloadSchemas()` 放在模块顶层，把初始化挪到实例启动时 | SDK 包内 `validators/cf-worker`、`preloadSchemas` 注释 |
| 官方一致性测试 `npx @modelcontextprotocol/conformance server --url <地址>`；调试工具 `npx @modelcontextprotocol/inspector --cli <地址> --transport http --method tools/list` | [conformance](https://github.com/modelcontextprotocol/conformance)、[inspector CLI](https://github.com/modelcontextprotocol/inspector/blob/main/clients/cli/README.md) |

本机实测（Node，22 个工具，每项取 300 次平均；Worker 免费版每个请求 CPU 上限 10 毫秒）：

| 做法 | 每个请求的 CPU |
| --- | --- |
| 工具输入用 zod 定义（SDK 示例写法） | 列工具 21 ms、调工具 14 ms、老客户端握手 14 ms（光建服务对象就 12 ms）——超限 |
| 工具输入用 JSON Schema + Worker 校验器 + 顶层预热 | 列工具 1.2 ms、调工具 0.6 ms、老客户端握手 0.6 ms |
| 一次读出全部历史（1.4 万条记录）再算 | 解析 27 ms、周回顾 13 ms、副业统计 80 ms——超限 |

结论：用 SDK v2 + JSON Schema；每个工具只按日期、状态查它需要的那部分记录（见 [MCP 服务](../模块设计/MCP服务.md#读数据按需查询)）。

## 三、各客户端的接法（固定令牌）

| 客户端 | 写法 | 坑 |
| --- | --- | --- |
| Claude Code | `claude mcp add --transport http deverdesk <地址> --header "Authorization: Bearer <令牌>"`；也可写 `.mcp.json`（`type` 必须写 `http`） | `.mcp.json` 漏写 `type` 会被当成本地程序；`${ANTHROPIC_AUTH_TOKEN}` 这类变量名会被读成空 |
| Codex | `~/.codex/config.toml`：`[mcp_servers.deverdesk]` 下写 `url`，令牌用 `http_headers = { "Authorization" = "Bearer <令牌>" }` 或 `bearer_token_env_var = "变量名"` | `bearer_token_env_var` 只收变量名；Codex 默认还走老版本协议 |
| Cursor | `~/.cursor/mcp.json`：`url` + `headers` | 远程服务不支持 envFile |
| VS Code | `.vscode/mcp.json`：`servers` 下 `type: "http"`、`url`、`headers` | 受工作区信任限制 |
| Claude 桌面版 / 网页 / 手机 | 本地配置文件不支持远程地址；自定义连接器的「请求头」还在小范围内测，普遍能用的是 OAuth——留到 M7 | 连接器从 Anthropic 云端发起，服务必须公网可达 |

出处：[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Codex config](https://developers.openai.com/codex/config-reference)、[Cursor MCP](https://docs.cursor.com/context/mcp)、[VS Code MCP](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)、[Claude 自定义连接器](https://claude.com/docs/connectors/custom/remote-mcp)、[连接器认证](https://claude.com/docs/connectors/building/authentication)。
