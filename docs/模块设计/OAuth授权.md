# OAuth 授权

- 模块定位：让 ChatGPT、Claude 网页版和手机版这类填不了令牌的 AI 应用连上 `/mcp`。AI 应用把你带到 DeverDesk 的授权页，你登录、选权限、点「允许」，DeverDesk 发给它一把会过期、能自己续期的钥匙。Claude Code、Codex、Cursor、VS Code 也能只填地址、在浏览器里点允许；原来复制令牌的方式照常可用。
- 对应代码：`worker/oauth/`（服务器一侧，见下文「代码结构」）、`worker/migrations/0004_oauth.sql`、`worker/mcp/index.ts`（认授权令牌）、`worker/routes/tokens.ts`（连接列表）、`src/app/authorize/page.tsx` 与 `src/features/oauth/`（授权页）、`src/features/auth/`（连接 AI 弹窗里的连接器地址和授权连接）、`scripts/acceptance/e2e-oauth.mjs`（端到端核对）
- 所属里程碑：[M7 OAuth 授权](../roadmap.md#m7)
- 界面规格：[前端设计 · 在线版的差异](../前端设计.md#在线版的差异)
- 当前状态：已完成（2026-10-02 用户验收通过）
- 最近更新：2026-10-02
- 依据：[调研：MCP 的 OAuth 授权](../调研/MCP授权.md)

## 职责与边界

负责：两份说明书；认 AI 应用的身份（读身份说明、自助登记、内置名单兜底）；授权页和它背后的检查、发授权码；授权码换令牌、续期、注销；`/mcp` 认授权来的令牌；授权连接在「连接 AI」列表里显示、改权限、断开。

不负责：MCP 协议和工具（[MCP 服务](MCP服务.md)）；口令登录和 Access（[登录与令牌](登录与令牌.md)、[云端接口](云端接口.md)）；改动怎么落库和撤销（[AI 改动记录](AI改动记录.md)）。本地版没有服务器，不做。

## 结构与数据流

```
AI 应用 ──POST /mcp（没带令牌）──→ 401 + 资源说明书地址
   │
   ├─ GET /.well-known/oauth-protected-resource/mcp ──→ 资源说明书：授权方是本站
   ├─ GET /.well-known/oauth-authorization-server   ──→ 授权方说明书：授权页、换令牌、登记的地址
   ├─（只有自助登记的客户端）POST /oauth/register ──→ 客户端编号
   │
   └─ 把浏览器带到 /authorize?client_id=…&redirect_uri=…&code_challenge=…&state=…&resource=…
                │
                ▼
        授权页（静态页面）
          ① 查登录状态，没登录先出口令框
          ② GET /api/oauth/authorize?<原样>：检查请求；身份说明类客户端去读它的说明，读不到用内置名单
          ③ 显示「{名字} 想连接你的 DeverDesk」「授权后回到 {网站}」、权限三选一
          ④ POST /api/oauth/authorize：再检查一遍，发授权码（只存摘要，5 分钟，只能用一次）
          ⑤ 浏览器跳回 redirect_uri?code=…&state=…&iss=…
                │
                ▼
AI 应用 ──POST /oauth/token（授权码 + PKCE 原文）──→ 通行令牌（1 小时）+ 续期令牌（30 天不用失效）
AI 应用 ──POST /mcp（Bearer 通行令牌）──→ 查令牌摘要 → 连接 → 权限档 → 和手动令牌一样装配工具
AI 应用 ──POST /oauth/token（续期令牌）──→ 新通行令牌 + 新续期令牌（旧续期令牌在新的第一次使用前仍然有效）
你在「连接 AI」里断开 ──→ 删掉连接和它的全部通行令牌，下一次请求就 401
```

## 地址

| 地址 | 方法 | 谁调 | 做什么 |
| --- | --- | --- | --- |
| `/.well-known/oauth-protected-resource/mcp` | GET | AI 应用 | 资源说明书（RFC 9728） |
| `/.well-known/oauth-protected-resource` | GET | AI 应用 | 同一份；有的客户端只读根路径 |
| `/.well-known/oauth-authorization-server` | GET | AI 应用 | 授权方说明书（RFC 8414） |
| `/oauth/register` | POST | AI 应用 | 自助登记（RFC 7591） |
| `/oauth/token` | POST | AI 应用 | 授权码换令牌、续期 |
| `/oauth/revoke` | POST | AI 应用 | 注销令牌（RFC 7009） |
| `/authorize` | GET | 浏览器 | 授权页；Worker 先接住，加上防嵌入、不缓存的响应头再交给静态页面 |
| `/api/oauth/authorize` | GET | 授权页 | 检查授权请求，返回给人看的名字和网站 |
| `/api/oauth/authorize` | POST | 授权页 | 允许或拒绝，返回跳回地址 |

- 给机器用的地址（说明书、`/oauth/*`）放在 `/api` 外面，部署在 Cloudflare Access 后面时加一条 `/oauth/*`、一条 `/.well-known/*` 的绕过规则即可；给人用的授权页和 `/api/oauth/authorize` 留在 Access 后面，用 Access 登录的人照样能授权。
- `wrangler.jsonc` 的 `run_worker_first` 加 `/oauth/*`、`/.well-known/*`、`/authorize`；`/.well-known/` 下别的路径照常交给静态资源。
- 本站地址：取请求的地址；开发时页面和接口不在一个端口，`scripts/dev.mjs` 给 wrangler 传 `PUBLIC_ORIGIN=http://localhost:3000`，说明书里的地址才指向页面那一侧。线上不设。
- 资源地址固定是 `<本站地址>/mcp`；授权方编号（issuer）是 `<本站地址>`。

## 两份说明书

资源说明书：

```json
{
  "resource": "https://<域名>/mcp",
  "authorization_servers": ["https://<域名>"],
  "scopes_supported": ["mcp"],
  "bearer_methods_supported": ["header"],
  "resource_name": "DeverDesk"
}
```

授权方说明书：

```json
{
  "issuer": "https://<域名>",
  "authorization_endpoint": "https://<域名>/authorize",
  "token_endpoint": "https://<域名>/oauth/token",
  "registration_endpoint": "https://<域名>/oauth/register",
  "revocation_endpoint": "https://<域名>/oauth/revoke",
  "response_types_supported": ["code"],
  "response_modes_supported": ["query"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_basic", "client_secret_post"],
  "revocation_endpoint_auth_methods_supported": ["none", "client_secret_basic", "client_secret_post"],
  "scopes_supported": ["mcp", "offline_access"],
  "client_id_metadata_document_supported": true,
  "authorization_response_iss_parameter_supported": true
}
```

- 只允许 GET（和 OPTIONS 预检），带 `Access-Control-Allow-Origin: *`，缓存 5 分钟。
- `/mcp` 的 401 改为 `WWW-Authenticate: Bearer realm="DeverDesk", resource_metadata="<资源说明书地址>", scope="mcp"`，带了令牌但不对时再加 `error="invalid_token"`；返回体不变。

## 认客户端

客户端编号有两种：

| 编号 | 怎么认 | 名字和网站 |
| --- | --- | --- |
| `https://` 开头的网址 | 读身份说明（规则见下）；读不到或内容不能用时查内置名单；名单里也没有就拒绝 | 名字取说明里的 `client_name`（没有就用网址的域名）；网站取跳回地址的域名 |
| `ddcl_` 开头 | 自助登记时发的，查 `oauth_clients` 表 | 名字取登记时报的 `client_name`（没有就用第一个跳回地址的域名） |

名字都是对方自报的：去掉控制字符、格式字符（从右往左排、零宽字符等）和行段分隔符，最多 100 字，免得把授权页标题和连接列表搅乱。

读身份说明（`worker/oauth/rules/client-metadata.ts`、`worker/oauth/clients/fetch-metadata.ts`）：

- 编号：https、有路径（不能只是 `/`）、不带账号密码和 `#`、路径里没有 `.` `..` 段、主机不能是 IP 或 `localhost`、最长 512 字。
- 读取：不跟随跳转、5 秒超时、只认 200、最多读 5 KB、必须是 JSON 对象；不缓存。
- 内容：`client_id` 必须和网址逐字相同；`redirect_uris` 是 1–20 个合格的跳回地址；认证方式是 `none`，或者 `token_endpoint_auth_methods_supported` 里列了 `none`（ChatGPT 的说明声明 `private_key_jwt`，同时列出支持 `none`，按公开客户端处理）；带 `client_secret` 的一律不认。
- 只在授权页那两步读（都要求已登录），换令牌、续期时不读：授权码和连接上已经记下了编号。
- 生产环境开兼容开关 `global_fetch_strictly_public`，读同一账号下别的域名时也走公网入口，不会绕过那边的访问控制。

内置名单（`worker/oauth/known-clients.ts`，只在读不到身份说明时用，读得到一律以线上为准）：

| 编号 | 名字 | 跳回地址 |
| --- | --- | --- |
| `https://claude.ai/oauth/mcp-oauth-client-metadata` | Claude | `https://claude.ai/api/mcp/auth_callback`、`https://claude.com/api/mcp/auth_callback` |
| `https://claude.ai/oauth/claude-code-client-metadata` | Claude Code | `http://localhost/callback`、`http://127.0.0.1/callback` |
| `https://chatgpt.com/oauth/client.json` | ChatGPT | `https://chatgpt.com/connector_platform_oauth_redirect` |
| `https://chatgpt.com/oauth/codex/client.json` | Codex | `http://127.0.0.1/callback`、`http://localhost/callback` |
| `https://vscode.dev/oauth/client-metadata.json` | Visual Studio Code | `http://127.0.0.1:33418/`、`https://vscode.dev/redirect` |

这些跳回地址要么在它们自家的网站上，要么在用户自己的电脑上，别人冒充编号也拿不到授权码。

自助登记（`POST /oauth/register`，JSON）：

- `redirect_uris` 必填，1–10 个；不合格的去掉、合格的照常登记（RFC 7591 允许服务器改写），一个合格的都没有才报 `invalid_redirect_uri`。Cursor 新版会同时报 `cursor://anysphere.cursor-mcp/oauth/callback`、`https://www.cursor.com/agents/mcp/oauth/callback`、`http://localhost:8787/callback`，授权时用的是本机地址；去掉 `cursor://` 之后照常登记。
- `token_endpoint_auth_method`：`none`（没写也按它）、`client_secret_basic`、`client_secret_post`；后两种发一个密钥（`ddcs_` 开头，只存摘要，只在登记时返回一次）。别的方式报 `invalid_client_metadata`。
- `grant_types` 只认 `authorization_code`、`refresh_token`（不认的去掉，必须含 `authorization_code`）；`response_types` 必须含 `code`；`client_name` 最多 100 字。
- 限速（`rate_limits` 表）：同一来源每小时最多 20 次，来源是 IPv4 地址或 IPv6 的前 64 位网段（同一台机器能随手换同一网段里的地址）；所有来源合起来每小时最多 60 次。超过回 429。
- 清理：每次登记先删掉登记后 7 天还没授权过的客户端、30 天没用（换令牌和续期都算用）且没有连接的客户端，再看总数，超过 10000 回 503（这时不写任何计数）；过了窗口的计数按键的前缀范围删，走主键索引。
- 返回 201：`client_id`、`client_id_issued_at`、`client_name`、`redirect_uris`、`grant_types`、`response_types`、`token_endpoint_auth_method`，有密钥时加 `client_secret` 和 `client_secret_expires_at: 0`。

## 跳回地址

- 合格：`https://` 的任意地址；或者 `http://` 且主机是 `localhost`、`127.0.0.1`、`[::1]`。不能带 `#`，最长 512 字。别的协议（含 `javascript:`、自定义协议）一律不收。
- 匹配：逐字相同；或者两边都是本机 http 地址，主机、路径、查询串相同，端口可以不同（Codex、Claude Code 的说明里不写端口，VS Code 写了 33418 但实际可能换端口）。
- 授权请求里必须带 `redirect_uri`。

## 授权请求的检查（`worker/oauth/authorize.ts`）

按顺序检查，结果分三种：

| 结果 | 情况 | 怎么处理 |
| --- | --- | --- |
| 链接无效 | `client_id` 缺失或格式不对；自助登记的编号查不到；身份说明读不到且不在内置名单；`redirect_uri` 缺失、不合格或对不上 | 授权页显示「授权链接无效」和一行原因，不跳转 |
| 带错误跳回 | `response_type` 不是 `code`（`unsupported_response_type`）；没带 `code_challenge`、方式不是 `S256`、格式不对（43 位 base64url）（`invalid_request`）；带了 `resource` 但不是本站 `/mcp`（`invalid_target`）；`state` 超过 1024 字（`invalid_request`） | 授权页显示「{网站} 发来的授权请求有误」和「回到 {网站}」按钮，你点了才跳回 `redirect_uri`（带 `error`、`error_description`、`state`、`iss`）。不自动跳：跳回地址虽然登记过，但谁都能自助登记、谁都能挂身份说明，自动跳等于让别人借本站把你带到任意网站 |
| 可以授权 | 其余 | 授权页显示名字、网站、权限选择 |

- `resource`：比较前去掉结尾斜杠、主机转小写；没带就按本站 `/mcp`。
- `scope`：按空格拆开，只留 `mcp` 和 `offline_access`，不认识的忽略；授予的范围是 `mcp`，请求里有 `offline_access` 就再加上它。没带也按 `mcp`。
- 允许时：发授权码 `ddc_` + 43 位随机字符，库里存摘要、客户端编号和名字、跳回地址、`code_challenge`、资源、范围、你选的权限档，5 分钟过期；跳回 `redirect_uri?code=…&state=…&iss=<本站地址>`。
- 拒绝时：跳回 `redirect_uri?error=access_denied&state=…&iss=…`。
- `/api/oauth/authorize` 两个方法都只认口令登录和 Access（个人令牌 403），走现有 `/api` 的身份校验；POST 还要求 `Origin` 等于本站地址、内容是 JSON，防跨站提交。返回一律 200，内容三选一：`{status:"ok", client:{name, host, loopback}}`、`{status:"redirect", redirectTo}`、`{status:"invalid", reason}`，`reason` 是 `client_id`、`unknown_client`、`metadata_unavailable`、`redirect_uri` 之一，页面按它显示对应语言的话。

## 换令牌（`POST /oauth/token`）

- 只收表单（`application/x-www-form-urlencoded`），最多 16 KB；返回 JSON，带 `Cache-Control: no-store` 和 `Access-Control-Allow-Origin: *`。
- 客户端认证：有 `Authorization: Basic` 按 `client_secret_basic`；有 `client_secret` 参数按 `client_secret_post`；否则按公开客户端，必须带 `client_id`。登记为带密钥的客户端必须带对密钥（比摘要，常数时间）；公开客户端带了密钥也忽略。只带签名断言（`client_assertion`）、没带 `client_id` 时，从断言里读出编号（ChatGPT 的身份说明首选 `private_key_jwt`）：签名不验，只认身份说明类的网址编号，仍按公开客户端对待，安全靠 PKCE 和续期令牌本身。认证失败回 401 `invalid_client`。
- `grant_type=authorization_code`：必须带 `code`、`redirect_uri`、`code_verifier`。找不到、过期、客户端不同、`redirect_uri` 不逐字相同、`S256(code_verifier)` 对不上都回 `invalid_grant`；带了 `resource` 却和授权码上的不同回 `invalid_target`。授权码用一条「只在还没用过时才改」的语句标成已用；**已经用过的授权码再来**，或者同时来两次、被另一个请求抢先换走，都删掉由它建出的连接和令牌，回 `invalid_grant`。成功后建连接、发令牌。
- `grant_type=refresh_token`：按摘要在连接的「当前」或「上一张」续期令牌里找；找不到、过期（顺手删掉这条连接）、客户端不同回 `invalid_grant`；`resource` 不同回 `invalid_target`；`scope` 超出原来的范围回 `invalid_scope`。
  - 用的是当前那张：上一张换成它、记下换下的时间，当前换成新的。
  - 用的是上一张、且换下不到 2 分钟（客户端没收到上次的结果，马上重试）：当前换成新的，上一张和换下时间不动。
  - 用的是上一张、但换下已超过 2 分钟：多半被盗了，整条连接作废（拿着新令牌的一方也要重新授权），回 `invalid_grant`（RFC 9700 4.14.2）。
  - 两种轮换都用「只在没被别人改过时才改」的语句，失败重读一次。续期令牌的过期时间每次往后顺延 30 天；顺手删掉这条连接已过期的通行令牌；自助登记的客户端记一次最近使用。
  - 已知局限：同一张续期令牌同时来两次续期，后到的一次会把先到那次发的新令牌顶掉；客户端如果存下的是先到那次的结果，下次续期失败，要重新授权。一次只能有一张有效的续期令牌，轮换方案都有这个现象。
- 成功返回：`{ access_token, token_type: "Bearer", expires_in: 3600, refresh_token, scope }`。
- 别的 `grant_type` 回 `unsupported_grant_type`。

## 注销（`POST /oauth/revoke`）

表单 `token`（`token_type_hint` 可不给），客户端认证同上。续期令牌：删掉整条连接和它的通行令牌；通行令牌：只删这一张。找不到也回 200（RFC 7009）。

## 令牌和连接

| 东西 | 样子 | 有效期 | 存法 |
| --- | --- | --- | --- |
| 授权码 | `ddc_` + 43 位 | 5 分钟，只能用一次 | 摘要；用过后留到过期，用来发现重复使用 |
| 通行令牌 | `ddo_` + 43 位 | 1 小时 | 摘要；同一条连接续期交替时可能同时有两三张 |
| 续期令牌 | `ddr_` + 43 位 | 30 天不用失效，每次续期顺延 | 连接上存「当前」和「上一张」的摘要，以及上一张换下的时间 |
| 连接 | 一次「允许」一条 | 跟着续期令牌走 | 客户端编号和名字、网站、权限档、资源、范围、创建和最近使用时间 |

- `/mcp` 认令牌：`dd_` 开头查个人令牌（不变）；`ddo_` 开头查通行令牌，要求没过期、连接的资源等于本站 `/mcp`；身份是 `{ id: 连接编号, name: 客户端名字, tier: 连接的权限档 }`，后面的工具装配、改动归属、限速、`manage_changes` 只认自己的改动，都和个人令牌一样。连接的最近使用时间每分钟最多更新一次。
- `/api` 只认个人令牌：通行令牌拿去调同步、建任务等接口一律 401。
- 同一个应用再授权一次会多一条连接，旧的不会自动删（同一个 ChatGPT 可能登着两个账号）；30 天没用的连接自己失效，也可以在列表里断开。
- 清理：每次发授权码时顺手删掉过期的授权码、过期的通行令牌、过期的连接和它们的令牌。

## 数据表（迁移 0004）

| 表 | 存什么 |
| --- | --- |
| `oauth_clients` | 自助登记的客户端：编号、名字、跳回地址（JSON）、认证方式、密钥摘要、登记时间、最近使用时间 |
| `oauth_codes` | 授权码：摘要、客户端编号和名字、网站、跳回地址、`code_challenge`、资源、范围、权限档、过期时间、换出的连接编号（用过才有） |
| `oauth_grants` | 连接：编号（`og_` 开头）、客户端编号和名字、网站、权限档、资源、范围、当前和上一张续期令牌的摘要、上一张换下的时间、续期令牌过期时间、创建和最近使用时间 |
| `oauth_tokens` | 通行令牌：摘要、连接编号、过期时间 |
| `rate_limits` | 通用限速计数：键（`register:<来源>`、`register-total`）、次数、计数起点 |

身份说明类客户端不落库：编号就是网址，授权码和连接上记着它。

## 授权页（`/authorize`）

- 静态页面，不在工作台外壳里；按 `window.location.search` 读授权请求，原样转给 `/api/oauth/authorize`。
- 状态：加载（两条灰块）→ 没登录时显示登录页同款口令框，登录成功原地换成授权卡 → 授权卡 → 点完显示「正在回到 {网站}…」后跳转。链接无效显示一行原因，不给按钮；请求在点允许前就有错时显示「{网站} 发来的授权请求有误」和「回到 {网站}」按钮，不自动跳；连不上服务器给「重试」。本地版直接显示「本地版不能连接 AI 应用」。
- 授权卡：品牌标志；标题「{名字} 想连接你的 DeverDesk」（名字随来连的应用变，ChatGPT、Claude、Cursor 都一样套）；下一行「授权后回到 {网站}」，网站名醒目显示，因为名字是对方自报的、网站才是判断真假的依据；跳回本机时换成「授权后交给这台电脑上的程序（{主机}）」并用提醒色；权限三选一，默认「只能提议」，下面一行小字解释；「拒绝」「允许」两个按钮。
- 响应头：`Content-Security-Policy: frame-ancestors 'none'`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`。
- 口令登录的会话 Cookie 是 `SameSite=Strict`：AI 应用把浏览器带过来那一下不带 Cookie，但静态页面不需要；页面随后发给本站接口的请求是同站请求，Cookie 会带上。

视觉规格见 [前端设计 · 在线版的差异](../前端设计.md#在线版的差异)。

## 连接 AI 弹窗的变化

- 列表：授权来的连接和手动令牌放在一起，按创建时间倒序。授权连接的第二行是「{网站} · 几月几日授权 · 几月几日用过 / 没用过」；同样有权限下拉；按钮叫「断开」，二次确认「断开「{名字}」？」「断开后它马上不能再访问，要用时重新授权」。
- 顶部一行「连接器地址」：只读框显示 `<本站地址>/mcp` 和「复制」，下面一行小字「ChatGPT、Claude 等添加自定义连接器时填这个地址」。
- `GET /api/tokens` 的每一项多 `kind`（`token` / `oauth`）和 `host`（授权连接才有）；`PATCH`、`DELETE /api/tokens/<编号>` 先找个人令牌，找不到再找连接；断开连接时连同它的通行令牌一起删。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `worker/oauth/index.ts` | 入口：分发说明书、`/oauth/*`、`/authorize`，别的路径交回 Worker 入口 |
| `worker/oauth/config.ts` | 有效期、前缀、范围、地址这些常量；本站地址、资源地址、资源说明书地址 |
| `worker/oauth/http.ts` | OAuth 格式的错误和成功响应、跨域头、限长读表单和 JSON、「参数只能出现一次」 |
| `worker/oauth/authorize.ts` | 授权请求的检查（三种结果）、发授权码、拼跳回地址 |
| `worker/oauth/identity.ts` | `/mcp` 用：通行令牌 → 连接身份 |
| `worker/oauth/rules/` | 纯规则：跳回地址（`redirect-uri.ts`）、PKCE（`pkce.ts`）、范围和资源地址（`scope.ts`）、身份说明的编号和内容（`client-metadata.ts`）、自助登记的内容（`registration.ts`）、限速的来源（`rate-limit.ts`） |
| `worker/oauth/clients/` | 认客户端：内置名单（`known-clients.ts`）、读身份说明（`fetch-metadata.ts`）、按编号认（`resolve.ts`）、换令牌和注销时的客户端认证（`authenticate.ts`）、共用类型和依赖（`types.ts`） |
| `worker/oauth/endpoints/` | 各个地址：两份说明书（`metadata.ts`）、换令牌和续期（`token.ts`）、自助登记（`register.ts`）、注销（`revoke.ts`）、`/api/oauth/authorize` 的两个方法（`consent.ts`）、授权页响应头（`authorize-page.ts`） |
| `worker/oauth/store/` | D1 读写：自助登记的客户端（`clients.ts`）、授权码（`codes.ts`）、连接和通行令牌（`grants.ts`）、限速计数和过期清理（`maintenance.ts`） |
| `worker/oauth/test-support.ts` | 测试共用：内存 D1、固定时间、假的外部读取、走一遍授权的小工具 |
| `src/app/authorize/page.tsx`、`src/features/oauth/` | 授权页：外框（`authorize-frame.tsx`）、授权卡（`consent-card.tsx`）、状态流转（`authorize-screen.tsx`） |
| `src/lib/oauth-api.ts` | 授权页调的两个接口 |
| `src/features/auth/connector-address.tsx`、`token-row.tsx`、`tokens-dialog.tsx` | 连接 AI 弹窗：连接器地址、授权连接的行和断开确认 |

## 关键决策

| 决策 | 理由 |
| --- | --- |
| 自己在 D1 上实现，不用 `@cloudflare/workers-oauth-provider` | 那个库只能存 KV：断开连接后旧令牌还能用一阵（最坏到过期）；自己部署的人要多建一个 KV；免费额度每天 1000 次写入。自己实现的话，断开立即生效，和手动令牌同一个列表、同一套权限和改动归属。代价是安全相关的代码要自己负责，用该库历史上的漏洞逐条写测试兜住 |
| 身份说明和自助登记都做 | 新版协议推荐身份说明，Claude、ChatGPT、Codex、VS Code 都支持；Cursor 只支持自助登记 |
| 内置一份常用应用名单兜底 | 本机连不上 claude.ai，有人报告从云服务器读 Claude 的说明会被拦；读不到就授权失败。名单里的跳回地址都在它们自家网站或用户本机，冒充者拿不到授权码；读得到时以线上为准 |
| 权限在授权页上选，默认「只能提议」，连上后列表里随时改；不用 OAuth 范围表达权限 | 和手动令牌一致；客户端会把说明书里列的范围全要一遍，用范围表达权限反而说不清；改权限立即生效，不用重新授权 |
| 通行令牌 1 小时，续期令牌 30 天不用失效 | 通行令牌泄露的影响限在一小时内；一个月不用就要重新点一次允许，和网页登录的 30 天一致 |
| 续期令牌轮换；上一张只在换下后 2 分钟内能重试，过了再用就整条作废 | 规范要求公开客户端必须轮换；客户端没收到续期结果时会马上重试，2 分钟够用；换下好一阵的旧令牌又出现，多半是被盗，按 RFC 9700 收回整条连接。评审指出原来「上一张一直有效到新的被用」时，偷到旧令牌的人能把真主人挤掉而不被发现 |
| 授权码被重复使用就作废它建出的连接，同时来两次也算 | OAuth 2.1 的要求：授权码被截走时，把已经发出去的令牌也收回 |
| 检查请求时发现的错误不自动跳回，让你点按钮 | 谁都能自助登记、谁都能挂身份说明，自动跳等于让别人借本站把刚登录的你带到任意网站（评审指出）；点了允许或拒绝之后的跳转是你自己的操作，照常直接跳 |
| 自助登记时去掉不合格的跳回地址，剩下的照常登记 | Cursor 新版会同时报一个 `cursor://` 地址，整份拒绝会让 Cursor 连不上；规范要求跳回地址只能是 https 或本机地址 |
| 登记限速按来源（IPv6 按 /64 网段）加总量 | 只按单个地址计数时，换 IPv6 地址就能无限刷；总量上限保证再多地址也刷不出更多写入 |
| 只带签名断言时从断言里读编号，签名不验 | ChatGPT 的身份说明首选签名断言；万一它不按说明书改用公开方式，也不至于连不上；签名不验时按公开客户端对待，不比只带编号更弱 |
| 授权页放在 `/authorize`，给机器的地址放在 `/oauth/*` | Access 用户只需给 `/oauth/*`、`/.well-known/*` 加绕过，授权页仍受 Access 保护 |
| 授权页做成静态页面，检查放在接口里 | 能直接用现有的设计令牌、组件和多语言；口令 Cookie 是 `SameSite=Strict`，静态页面加载后发的同站请求能带上它 |
| 授权请求不在服务器上暂存，允许时整份再检查一遍 | 少一张表，也没有过期清理的问题 |
| 只在已登录的授权页步骤里读身份说明 | 读外部网址的入口不对没登录的人开放，免得被拿来当跳板 |
| 授权令牌只能用于 `/mcp` | 令牌是发给 `/mcp` 的（规范要求核对令牌发给谁）；同步、建任务这些接口继续只认手动令牌、口令和 Access |
| 不支持 `private_key_jwt` | ChatGPT 同时支持公开客户端，PKCE 已经保证授权码只有发起的一方能换；少一套签名校验 |

## 当前实现

- 服务器：上面的地址、规则和数据表全部实现。授权码换连接放在一个批次里：先用「只在还没用过时才改」的语句把授权码标成已用，建连接和发第一张通行令牌都以「授权码确实是这次标的」为前提，两个请求抢同一个授权码时只有一个能建出连接。续期轮换同样用条件更新，抢输的一方如果手里的那张刚好成了「上一张」，按上一张再试一次。
- `/mcp`：`ddo_` 开头的走授权令牌，别的照旧按个人令牌查；401 带资源说明书地址和 `scope="mcp"`；时间取依赖里的 `now()`，测试能固定。
- 授权页：静态页面，请求原样转给接口；登录、加载、授权卡、跳转中、链接无效、连不上、本地版七种状态；文字全部在 `oauth` 词条里，中英文两套。
- 连接 AI 弹窗：顶部连接器地址；授权连接用链接图标、显示网站、按钮叫「断开」，确认框文字和撤销令牌分开。
- 开发：`pnpm dev` 给 wrangler 传 `PUBLIC_ORIGIN`，`next dev` 把 `/oauth`、`/.well-known` 也转给 wrangler；授权页由 `next dev` 直接出。
- 部署：`wrangler.jsonc` 加了兼容开关 `global_fetch_strictly_public`，`run_worker_first` 加了三个路径；自己部署的配置副本要同样加上，否则说明书和授权页会被静态资源接走。

## 验证方式

- 现状：`pnpm test` 全仓 837 条通过（OAuth 87 条）；`pnpm e2e:oauth` 27/27 通过；原有的 `pnpm e2e` 24/24 通过；类型检查、代码检查、打包通过。安全评审 8 条，修了 7 条，1 条（同时续期顶掉一张）写进上面的已知局限。真实客户端等部署到个人实例后由用户实连。
- `pnpm test`：跳回地址合格与匹配（本机地址换端口、`javascript:` 等协议、带 `#`）、PKCE、身份说明的编号检查和内容检查（不跟随跳转、超过 5 KB、编号不一致、带密钥、只列 `private_key_jwt`）、读不到时用内置名单、名字里的不可见字符、授权请求三种结果、授权码只能用一次和重复使用作废连接（含同时来两次）、只带签名断言的换令牌、续期轮换（当前、2 分钟内重试上一张、超过 2 分钟用上一张整条作废、都不是、过期）、注销、自助登记的检查（Cursor 的 `cursor://` 地址）、限速（IPv6 网段、总量、过期计数清理）和客户端保留、`/mcp` 认授权令牌（过期、资源不对、断开后）、`/api` 不认授权令牌、401 的响应头、两份说明书。该库历史上的漏洞逐条对应：授权和换令牌两处都核对跳回地址、不能不带 PKCE 换令牌、不能用 plain、`javascript:` 跳回地址、无效链接不跳转。
- `pnpm build && pnpm e2e:oauth`：本机起 wrangler，用官方客户端 SDK 走完整授权（自助登记一遍；读 VS Code 的真实身份说明一遍），浏览器自动化在授权页登录、选权限、点允许；三档权限各连一次，调工具 → 续期 → 断开 → 401；拒绝时跳回带 `access_denied`；请求有误时不自动跳走；原来的手动令牌照常能用。
- 真实客户端：部署到个人实例后，用 ChatGPT 网页版（开发者模式）、Claude 网页版和手机版、Claude Code（只填地址）各连一次，看今天、建一个任务。

## 待扩展项

- ChatGPT 的授权彻底失效后，在对话里弹「重新连接」：要按 ChatGPT 的格式给工具补 `securitySchemes`，并在出错结果里带 `_meta["mcp/www_authenticate"]`。
- 缓存读到的身份说明（规范建议按对方的缓存头缓存）。
- 支持 `private_key_jwt`。

## 改动历史

- 2026-10-02：首版设计：两份说明书、身份说明加自助登记加内置名单、授权页、授权码和令牌规则、连接并进「连接 AI」列表、授权令牌只用于 `/mcp`。
- 2026-10-02：实现完成：服务器一侧、授权页、连接 AI 弹窗、端到端核对（官方客户端 SDK 2.2.0 走自助登记和 VS Code 真实身份说明两条路，SDK 按 RFC 9207 核对 `iss` 通过）。
- 2026-10-02（安全评审后）：自助登记去掉不合格的跳回地址、剩下的照常登记（Cursor 会带 `cursor://`）；检查请求时的错误不再自动跳回；登记限速按来源（IPv6 按 /64 网段）加总量，先看名额再写计数，过期计数按主键范围清理；续期令牌的上一张只在换下后 2 分钟内能重试，过了再用整条作废；授权码同时来两次也收回抢先建出的连接；续期也记作客户端用过，没授权过的客户端保留 7 天；名字去掉格式字符；只带签名断言时从断言里读编号。
