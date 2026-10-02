# MCP 服务

- 模块定位：在线版给 AI 助手开的门。Claude Code、Codex、Cursor 这类工具通过 MCP（AI 助手调用外部工具的统一协议）连上来，替用户随手记、查情况、排时间。
- 对应代码：`worker/mcp/`（`index.ts` 入口与鉴权、`server.ts` 按权限装配工具、`registry.ts` 把工具定义接到 SDK、`instructions.ts` 使用说明、`clock.ts` 时区换算、`data/` 按需查询、`tools/read|capture|plan|changes/` 各组工具）、`src/domain/operations/`（界面和 AI 共用的业务规则）；写入交给 [AI 改动记录](AI改动记录.md)
- 所属里程碑：[M4 MCP：让 AI 替你管（第一期）](../roadmap.md#m4)
- 当前状态：已完成（2026-10-02 用户验收通过）
- 最近更新：2026-10-02
- 依据：[调研：MCP 协议、官方 SDK 与客户端接法](../调研/MCP协议与SDK.md)

## 职责与边界

负责：`/mcp` 地址的协议收发（新版 2026-07-28 和老版本客户端都接）、令牌校验、按令牌权限给出工具、22 个工具的输入校验与执行、按用户时区算「今天」、按需读数据。

不负责：改动怎么落库、怎么撤销和采纳（[AI 改动记录](AI改动记录.md)）；令牌的新建和管理界面（[登录与令牌](登录与令牌.md)）；OAuth 授权（M7）；本地版（数据只在浏览器里，没有服务器可连）。

## 结构与数据流

```
AI 客户端 ──POST /mcp──→ ① 入口：Origin 检查 → 令牌校验（只认 Bearer 访问令牌）
                              │
                              ▼
                          ② SDK（官方 v2）：分辨新老版本、校验请求头和参数、组装结果
                              │  每个请求按令牌权限装配一份工具清单
                              ▼
                          ③ 工具：读工具 ──→ ④ 按需查询（只查需要的日期和状态）──→ D1
                                  写工具 ──→ 算出「要改哪些记录、改前改后」
                                              │
                                              ▼
                                         ⑤ AI 改动记录：直接写入 / 存成提议 / 先给预览
```

1. 入口在 Worker 最外层分流：`/mcp` 不走 `/api` 的路由表；`wrangler.jsonc` 的 `run_worker_first` 加上 `/mcp`。
2. SDK 负责全部协议细节（新版的 `server/discover`、`resultType`、缓存提示、请求头校验；老版本的 initialize、ping、GET/DELETE 回 405）。我们只给它工具定义和执行函数。
3. 工具分四组，见下文「工具清单」。
4. 查询走 D1 的 JSON 字段过滤和表达式索引，Worker 里只解析查回来的那部分记录。
5. 写工具不直接写库：它交出改动清单，由改动记录模块按令牌权限决定立即生效、存成提议还是先给预览。

## 接入

| 项 | 规则 |
| --- | --- |
| 地址 | `https://<部署域名>/mcp`，只在在线版有 |
| 方法 | 只收 POST；GET、DELETE 回 405（SDK 处理） |
| 登录 | 只认请求头 `Authorization: Bearer dd_…`（头像菜单「连接 AI」里新建的令牌）。口令 Cookie 和 Access 身份都不认，避免网页里被别的站点借用登录态 |
| 未登录 | 401，带 `WWW-Authenticate: Bearer realm="DeverDesk"`；带了令牌但不对时加 `error="invalid_token"`；返回体 `{ "error": "…" }` |
| Origin | 没带 Origin 放行（命令行和桌面客户端不带）；带了就必须等于本站域名，否则 403 |
| 部署在 Access 后面 | Access 会先拦住 AI 客户端。需要在 Access 里给 `/mcp` 加一条「绕过」规则，令牌校验由 DeverDesk 自己做（写进 README 和连接弹窗的提示） |
| 协议版本 | 新版 2026-07-28 和老版本 2025-11-25、2025-06-18 等（SDK v2 的兼容范围）都接 |
| 令牌最近使用时间 | 和现有接口一样，每分钟最多更新一次 |

### 权限三档

令牌带权限（存在令牌表里，见 [云端接口](云端接口.md)）：

| 档 | 叫法 | 看到哪些工具 | 写工具的效果 |
| --- | --- | --- | --- |
| `read` | 只看 | 只有读工具 | — |
| `propose` | 只能提议 | 全部 | 改动存成提议，等用户在页面里采纳 |
| `write` | 直接改 | 全部 | 立即生效；删除或一次超过 10 条先给预览 |

工具清单按权限过滤（规范允许清单随授权范围变化）。只看档调用写工具时（客户端缓存了旧清单），SDK 按「工具不存在」回协议错误。

## 工具清单

| 组 | 工具 | 做什么 | 权限 |
| --- | --- | --- | --- |
| 查情况 | `get_day` | 某天（默认今天）的计划、时间线、容量、逾期、例行、投入、计时器、本月收支 | 全部 |
| | `get_week` | 某周七天的负载和任务，加上没排日子的任务 | 全部 |
| | `list_projects` | 全部副业和本月的收入、工时、时薪、下一个里程碑 | 全部 |
| | `get_project` | 一个副业的完整档案 | 全部 |
| | `get_stats` | 最近一周、一月、一季、一年或自己指定的一段时间的收入、工时、时薪、完成数，按副业拆分，和前面同样长的一段对比 | 全部 |
| | `get_week_review` | 某周回顾的数据和已写的三段笔记 | 全部 |
| | `search` | 按关键词找任务、副业、收支 | 全部 |
| | `query_records` | 按种类、日期、状态、副业筛记录，给 AI 自己算 | 全部 |
| 随手记 | `add_tasks` | 一次新建 1–20 个任务 | 提议、直接改 |
| | `add_ledger_entries` | 一次记 1–20 笔收支，按外部单号防重复 | 提议、直接改 |
| | `log_time` | 补记 1–20 段投入时间 | 提议、直接改 |
| | `timer` | 开始、停止计时，或看计时状态 | 提议、直接改 |
| | `check_routine` | 例行打卡或取消打卡 | 提议、直接改 |
| | `write_week_notes` | 写某周回顾的三段笔记 | 提议、直接改 |
| 排时间 | `update_tasks` | 一次改 1–20 个任务（状态、日子、时间、优先级、子任务……） | 提议、直接改 |
| | `plan_day` | 把任务排进某天时间线的空档 | 提议、直接改 |
| | `plan_week` | 按每天能拿出的时间把任务分到一周 | 提议、直接改 |
| | `reschedule` | 把逾期或某天的任务挪到别的日子，或整体往后推几天 | 提议、直接改 |
| | `manage_project` | 新建、修改副业，管里程碑 | 提议、直接改 |
| | `manage_routine` | 新建、修改、归档例行 | 提议、直接改 |
| | `delete_records` | 删除任务、收支或投入记录 | 提议、直接改 |
| 改动 | `manage_changes` | 确认预览、撤销自己做的改动、撤回自己的提议 | 提议、直接改 |

### 共同约定（写进每个工具的说明）

- 工具名、说明、报错都用英文（各家模型都认，开源用户也不限中文）；说明第一句讲做什么，第二句讲什么时候用；写工具注明「may be queued for the user's approval」。
- 注解：读工具 `readOnlyHint: true`；写工具 `readOnlyHint: false`，`destructiveHint` 只给 `update_tasks`、`reschedule`、`manage_project`、`manage_routine`、`delete_records`、`manage_changes` 设为 true，其余新建类设为 false；全部 `openWorldHint: false`。
- 日期一律 `YYYY-MM-DD`，时间 `HH:mm`，日期加时间 `YYYY-MM-DDTHH:mm`，全部是用户时区的本地时间；时长单位分钟；金额是数字，币种看 `get_day` 返回的 `currency`。
- 引用任务：`task` 字段填内部编号（`t-…`）或显示编号（`T-123`，大小写不限）。
- 引用副业：`project` 字段填内部编号或名称；名称按「完全相同（不分大小写）→ 唯一的开头匹配 → 唯一的包含匹配」找，找到多个就报错并列出候选；填 `null` 表示不属于任何副业（「个人」）。
- 引用例行：内部编号或标题，规则同副业。
- 输入校验：形状和取值范围写在 JSON Schema 里（SDK 校验，出错自动给 `isError`）；字段怎么搭配的规则（二选一、至少改一项、某个动作必填哪些字段、有开始时间就必须有日子）一律不写进参数定义，不用 `oneOf`、`allOf`、`if/then`、`not`，也不用要求必填字段的 `anyOf`。这类规则写进字段说明，在执行时检查，出错抛 `ToolInputError`，统一转成 `isError` 结果，文字说清哪一条、为什么。原因：写进参数定义后，SDK 只会报「没有恰好匹配一种写法」这类 AI 看不懂的话，工具自己写好的提示反而到不了；Claude Code 这类客户端也不支持顶层的 `oneOf`/`allOf`，会把它拍平成一段文字提示。`worker/mcp/registry.test.ts` 有守卫测试，新增工具违反这条会直接测不过。
- 输出：结构化对象放 `structuredContent`，同时把它的 JSON 文本放进 `content`（规范建议，兼容老客户端）。列表有上限，超出时带 `truncated: true`。
- 金额和时薪：收入、支出、净收入、时薪这些加减或相除之后的结果，输出前一律四舍五入到分（两位小数），避免 `108.78999999999999` 这样的浮点尾数。取整只在输出这一步做，不改领域层的计算。
- 写工具的输出统一多一个 `changeset` 字段：`{ id, status, applied, conflicts, message }`，`status` 为 `applied` / `proposed` / `preview` / `no_change`；`message` 用一句英文告诉 AI 下一步（提议：等用户在 DeverDesk 的 AI 动态里采纳；预览：把清单给用户看，用户同意后用 `manage_changes` 确认）。

### 统一的输出形状

| 名称 | 字段 |
| --- | --- |
| 任务 | `id`、`code`（T-123）、`title`、`status`、`priority`、`project`（`{id,name}` 或 `null`）、`estimateMin`、`plannedFor`、`startAt`、`dueOn`、`subtasks`（`{done,total}`，有子任务时多一个 `items`，每条是 `{id,title,done}`）、`notes`（备注原文，没有备注不给这个键）、`loggedMin`（已投入，只在查询带了投入记录时给）、`completedAt`（本地日期时间或 `null`）、`byAi`（AI 建的为 `true`，否则不给） |
| 收支 | `id`、`kind`、`amount`、`project`、`category`、`channel`、`status`、`date`、`expectedOn`、`note`、`externalId`、`byAi` |
| 投入 | `id`、`start`、`end`（本地日期时间）、`minutes`、`project`、`task`（`{id,code,title}` 或 `null`）、`byAi` |
| 副业 | `id`、`name`、`color`、`stage`、`goal`、`monthlyTarget`、`startedOn` |
| 例行 | `id`、`title`、`cadence`、`estimateMin`、`project`、`archived` |

### 各工具的规格

**`get_day`**：输入 `date?`（默认今天）。输出：`date`、`today`、`timeZone`、`timeZoneKnown`（作息设置里没有时区时为 `false`，此时按 UTC 算并提醒用户打开一次页面）、`currency`、`weekday`；`capacity`（`capacityMin`、`plannedMin`、`routineMin`、`overbooked`，和今天页容量条同一套算法）；`timeline`（这天排了开始时间的任务，按时间排）；`planned`（这天计划了但没排时间的）；`overdue`（截止日已过或计划日已过还没做完的，最多 20）；`dueSoon`（三天内截止的，最多 10）；`routines`（这天该做的例行：`id,title,due,done,streak`）；`tracked`（`totalMin` 和这天的投入记录）；`timer`（计时中的：`label,task,project,startedAt,runningMin`，没有为 `null`）；`money`（本月 `income,expense,net`、待到账笔数、逾期未到账的明细，和今天页右栏同一套算法）。

**`get_week`**：输入 `date?`（这周里任意一天，默认今天）。输出：`weekStart`、`weekEnd`、`days`（七天：`date,weekday,capacityMin,plannedMin,trackedMin,tasks`）、`unscheduled`（没排日子的待办数量和最重要的 15 个：优先级高的、截止早的在前）。

**`list_projects`**：输入 `includeEnded?`（默认不含「已结束」）。输出：`month` 和每个副业：基本信息 + 本月 `income,expense,net,minutes,hourlyRate` + `openTasks`（没做完的任务数）+ `nextMilestone`。

**`get_project`**：输入 `project`。输出：副业页卡片上的全部数字（净收入、工时、时薪、月目标进度、近 12 周走势，和界面同一个计算函数）+ 里程碑 `milestones`（`done`、`total`、最近一个没完成的 `next`，以及全部里程碑 `items`：没完成的在前、按截止日排，再是已完成的，每个 `{id,title,due,doneOn}`，最多 50 个，超出时 `itemsTruncated: true`；AI 标里程碑完成时按这里的编号或标题指定）+ 没做完的任务（最多 30）+ 最近完成的 10 个 + 最近 10 笔收支。

**`get_stats`**：输入 `range?`（`week`/`month`/`quarter`/`year`，默认 `month`）或 `start`+`end`（最长 366 天），`project?`。`range` 取截止今天的最近 7、30、90、365 天（含今天，滚动的，不按自然周、自然月）；今天是 10 月 2 日时，`month` 的本期是 9 月 3 日到 10 月 2 日，上一期是 8 月 4 日到 9 月 2 日。自己指定起止日期时，上一期同样是紧挨在前面、同样长的一段。输出：本期和上一期的 `income,expense,net,minutes,hourlyRate,tasksDone`；`byProject`；`estimateAccuracy`（预估和实际分钟、比值）；`minutesByWeekday`（周一到周日七个数）。

**`get_week_review`**：输入 `week?`（这周里任意一天，默认本周）。输出：回顾页同一套数据（完成的任务、投入和按副业分布、每天实际与计划、收支、估时准不准、例行完成率、和上周对比、这周是否还没过完）+ 已写的三段笔记。每天的计划时长是任务预估加上当天要做的例行事项，和今天页、本周页同一个容量算法。

**`search`**：输入 `query`（1–80 字）、`limit?`（每类默认 8，最多 20）。按标题、名称、备注找，不分大小写。输出 `tasks`、`projects`、`ledger`。

**`query_records`**：输入 `kind`（`task`/`ledger`/`entry`/`project`/`routine`/`note`）、`from?`、`to?`（日期范围；任务按 `dateField` 选计划日 `planned`、截止日 `due`、完成日 `completed`、创建日 `created`，默认 `planned`；收支按发生日；投入按开始时间；笔记按周）、`status?`（数组）、`project?`、`ledgerKind?`、`category?`、`channel?`、`text?`、`limit?`（默认 50，最多 100）、`offset?`。输出 `items`（统一形状）、`truncated`。

**`add_tasks`**：输入 `tasks`（1–20 个：`title`（1–80 字）、`project?`、`status?`（`backlog`/`todo`/`doing`/`done`，默认 `todo`）、`priority?`（0–4）、`estimateMin?`（0–1440，默认 30）、`plannedFor?`、`startAt?`（要有 `plannedFor`）、`dueOn?`、`notes?`（最多 2000 字）、`subtasks?`（最多 20 个标题））、`reason?`（最多 200 字，给用户看的一句为什么）。规则同界面新建任务（共用 `src/domain/operations/`）；显示编号由写入时统一分配；记录上标 `origin: "ai"`。输出新建的任务（统一形状，编号在写入后回填）。

**`add_ledger_entries`**：输入 `entries`（1–20 笔：`kind`（`income`/`expense`）、`amount`（大于 0，最多两位小数）、`project?`、`category?`（按收入或支出取对应的类别，默认「其他收入」「其他支出」）、`channel?`（默认 `platform`）、`status?`（`received`/`pending`，默认 `received`；支出只能是已支付，和界面一致）、`date?`（默认今天）、`expectedOn?`（只在 `pending` 时有效）、`note?`（最多 200 字）、`externalId?`（最多 120 字，外部订单号、流水号））、`allowDuplicates?`、`reason?`。防重复：外部单号已存在（或同一批里重复）的一律跳过；同一天、同收支方向、同金额、同副业的已有记录，在没写 `allowDuplicates: true` 时跳过并在 `skipped` 里给出疑似重复的那条（`allowDuplicates` 只放开这一条，不放开外部单号）。记录上标 `origin: "ai"`。输出 `created`、`skipped`（每条带原因）。

**`log_time`**：输入 `entries`（1–20 段：`start`（`YYYY-MM-DDTHH:mm`，或 `HH:mm` 配 `date`）、`end?` 或 `minutes?`（二选一）、`date?`、`task?`、`project?`（填了任务就用任务的副业））、`reason?`。规则：结束晚于开始，一段不超过 24 小时，结束不晚于现在；记录上标 `origin: "ai"`。

**`timer`**：输入 `action`（`start`/`stop`/`status`）、`task?`、`label?`、`project?`。开始：已有计时先结束并记成一段投入（不足一分钟不记），再开新的；带任务时任务变为「进行中」、没计划日子的计划到今天（和界面一致）；不带任务时必须有 `label`。停止：记成一段投入。`status` 只读。

**`check_routine`**：输入 `routine`、`date?`（默认今天）、`done?`（默认 `true`）。已经是目标状态时不产生改动（`no_change`）。

**`write_week_notes`**：输入 `week?`（这周里任意一天）、`wins?`、`improve?`、`next?`（每段最多 2000 字）、`mode?`（`replace` 覆盖、`append` 接在后面另起一行，默认 `replace`）。

**`update_tasks`**：输入 `updates`（1–20 个：`task` 加要改的字段：`title`、`status`、`priority`、`estimateMin`、`plannedFor`（`null` 取消计划）、`startAt`（`null` 从时间线拿下来）、`dueOn`、`project`、`notes`（覆盖）、`appendNotes`、`addSubtasks`、`completeSubtasks`、`reopenSubtasks`、`removeSubtasks`（子任务按编号、序号或标题指定，读任务时的 `subtasks.items` 里都看得到））、`reason?`。状态、计划日、开始时间的联动规则和界面完全一致（共用操作函数）：改状态走界面「切换状态」那条规则（改成完成时记完成时间、没计划日子的计划到今天、计时器在这个任务上就停下并记一段投入；改成搁置也停计时）；改了计划日没给开始时间就清掉开始时间。界面的编辑表单改状态时只记完成时间、不停计时，这是界面现有的另一条规则，第一期不动它。

**`plan_day`**：输入 `date?`（默认今天）、`tasks?`（按顺序给要排的任务；不给就排这天已计划但还没排开始时间的任务——和今天页「自动排进时间线」一致，按优先级、截止日、编号排序；这天一个都没有时才按界面「建议」的规则挑，并排除「想法」状态）、`from?`（从几点开始找空档；今天默认现在，其他日子默认作息设置的开始时间）、`busy?`（已被占用的时段，例如 AI 从日历读到的会议：`start,end,label`）、`dryRun?`。用界面「一键排进时间线」的同一个算法找空档；已经排在时间线上的任务和 `busy` 都算占用。输出 `placed`（任务、开始、结束）、`notPlaced`（放不下的和原因）、排完后的容量。`dryRun` 不产生改动。

**`plan_week`**：输入 `weekOf?`、`tasks?`（不给就取没排日子的待办和进行中任务）、`dryRun?`。按「截止早的先、优先级高的先、编号小的先」依次放到这周最早的、剩余时间放得下且不晚于截止日的那天（过去的日子不放）；放不下的：有截止日的放到截止日前剩余最多的那天并标 `overbooked`，没有截止日的留在 `notPlaced`。只改计划日，不排开始时间。分配算法写成纯函数放进 `src/domain/planning.ts`（界面以后也能用）。

**`reschedule`**：输入 `tasks?` 或 `selector?`（`overdue: true`、`plannedOn`、`plannedFrom`，至少给一样）、`to?` 或 `shiftDays?`（二选一，`shiftDays` 为 −30～30 的非零整数）、`keepTime?`（默认 `false`，清掉开始时间）。只动没做完的任务。

**`manage_project`**：输入 `action`（`create`/`update`/`add_milestone`/`update_milestone`/`complete_milestone`/`reopen_milestone`/`remove_milestone`）和对应字段：`project`、`name`（1–20 字）、`color`、`stage`、`goal`、`monthlyTarget`（`null` 清掉）、`milestone`（编号或标题，读 `get_project` 的 `milestones.items` 就能看到）、`title`、`due`。规则同界面。

**`manage_routine`**：输入 `action`（`create`/`update`/`archive`/`unarchive`）、`routine?`、`title?`、`cadence?`、`estimateMin?`、`project?`。

**`delete_records`**：输入 `items`（1–20 个：`kind`（`task`/`ledger`/`entry`）、`id`）、`reason?`。直接改档也一律先给预览；删任务时如果计时器在它上面，计时器一起清掉（和界面一致）。

**`manage_changes`**：输入 `action`（`confirm` 确认预览、`undo` 撤销、`withdraw` 撤回提议）、`changesetId?`（不给就取这个令牌最近一个符合条件的）、`seqs?`（只撤销其中几条）。只能动这个令牌自己产生的改动包；`confirm` 和 `undo` 要直接改档，`withdraw` 要提议档。规则见 [AI 改动记录](AI改动记录.md)。

## 业务规则共用：`src/domain/operations/`

界面的 `src/state/store.ts` 里有一批「改一条记录」的规则（新建任务的默认值、改状态时记完成时间、开始计时先结束旧计时、不足一分钟的计时不记……）。这些规则抽成纯函数放进 `src/domain/operations/`，界面和 MCP 都调它，保证 AI 改出来的数据和人在界面里改出来的一模一样。

| 文件 | 函数（输入 → 输出） |
| --- | --- |
| `tasks.ts` | `newTask(input, ctx)`、`patchTask(task, patch, ctx)`、`withStatus(task, status, ctx)`、`planOn(task, day)`、`scheduleAt(task, startAt, ctx)`、`moveToDay(task, day)`、子任务的增、勾、删 |
| `timer.ts` | `closeTimer(timer, now, newId)`、`startTimerOn(state, task, ctx)`（返回新计时器、要补的投入、改过的任务） |
| `ledger.ts` | `newEntry(input, ctx)`、`patchEntry(entry, input)`、`withEntryStatus(entry, status)` |
| `projects.ts` | `newProject(input, ctx)`、`patchProject(project, input)`、里程碑的增、改、勾、删 |
| `routines.ts` | `newRoutine(input, ctx)`、`patchRoutine(routine, input)`、归档、恢复（打卡沿用 `src/domain/routines.ts` 的 `toggleDone`） |
| `notes.ts` | `patchNote(note, patch)` |

`ctx` 是 `{ now, today, newId(prefix) }`：时间和编号都由调用方给，函数里不读系统时钟、不生成随机数，测试可以固定。抽完后 store 改为调用这些函数，行为不变。

## 读数据：按需查询

工具通过 `DataSource` 接口读数据（定义在 `worker/mcp/types.ts`），有两个实现：

- `worker/mcp/data/d1.ts`：D1 实现，按条件拼 SQL，只取没删除的记录，Worker 里只解析查回来的行；每条记录带上 `updatedAt`（写入时做冲突检查用）。
- `worker/mcp/data/memory.ts`：内存实现，从一份工作台数据造，单元测试用。

查询条件（`TaskQuery`、`EntryQuery`、`LedgerQuery`）覆盖：按编号、按显示编号、按状态、按计划日范围、按截止日范围、按完成时间范围、按副业、没排日子、按标题关键词、按外部单号、条数上限；任务列表可选择按优先级或截止日排序。`get_day` 的三天内截止候选用截止日上下界查询，并按截止日排序额外取一条判断是否截断。

`DataSource` 另提供项目任务计数和按任务汇总投入分钟的聚合查询，避免为计数或估时精度解析全部相关明细。投入聚合逐条按 `minutesOf` 规则四舍五入并将负值归零后再求和；D1 与内存实现需保持一致。

D1 实现的约定：

- 字段过滤一律写成 `json_extract(data, '$.字段')`，和迁移 0003 的表达式索引写法逐字一致，否则 SQLite 用不上索引。
- 同一个工具里能并发的查询用 `Promise.all`；一次工具调用总查询数（含鉴权、限速、写入）不超过 45（免费版每个请求 50 次）。
- 解析出错的行跳过，不让一条坏数据拖垮整个工具。

表达式索引（迁移 0003，只覆盖没删除的记录）：投入的开始时间、收支的日期、收支的外部单号、任务的状态、任务的计划日、任务的完成时间。

## 时区

- 作息设置加一项 `timeZone`（IANA 名称，如 `Asia/Shanghai`）。在线版浏览器登录后发现没有时区时，自动写入浏览器的时区；作息设置弹窗里可以改（常用时区列表 + 当前值）。
- `worker/mcp/clock.ts` 的 `createClock(timeZone, now)` 给出：今天、本地某天零点对应的真实时间、真实时间属于本地哪一天、本地日期时间和真实时间互转、现在是本地第几分钟。没有时区时按 UTC 并把 `timeZoneKnown` 设为 `false`。
- 界面的计算函数（`src/domain/`）按「运行环境的本地时间」取日期，Worker 的本地时间是 UTC。读工具调用这些函数前，先把查回来的记录里的时间戳换成「墙上时间」（用 UTC 读出来正好是用户的本地时间），算完的日期就是用户的本地日期；写回的时间戳一律是真实时间。给 AI 看的本地日期时间（完成时间、计时开始、投入起止）一律用查回来的原始记录来格式化，不用换算过的墙上时间版本，否则会被平移两次（周复盘曾因此把完成时间多算 8 小时）。
- 投入记录的开始和结束**按开始那一刻的偏移一起平移**，时长保持真实（夏令时切换那天跨过切换点的投入，不会多算或少算一小时）；其余单个时间戳（完成时间、创建时间、计时开始）各按自己那一刻的偏移平移。
- 换算规则只在 `clock.ts` 里写一次；Worker 侧测试在 UTC 下跑（和线上一致），并覆盖东八区、西五区和夏令时切换日。
- 现有 `GET /api/summary` 默认月份同样改成按用户时区算。

## 使用说明（instructions）

AI 连上时拿到的说明（英文，几百字以内）：DeverDesk 是什么；日期时间都是用户时区；先调 `get_day` 了解今天、时区、币种；引用任务用 T-123；尽量一次批量调用；写入可能进入用户的提议列表或先给预览，预览要给用户看过再确认；不要编造编号，先查再改；用户发布之后，恰好有一个没完成的里程碑对得上（名字或版本号吻合）就用 `manage_project` 标成完成并告诉用户，对不上或有几个候选就先问。

## 关键决策

| 决策 | 理由 |
| --- | --- |
| 用官方 SDK v2，工具输入用 JSON Schema 加 SDK 自带的 Worker 校验器，模块顶层预热 | 新老两代客户端的兼容细节很多，SDK 有一致性测试背书；实测这样每个请求约 1 毫秒 CPU，用 zod 定义要 14–21 毫秒，超过免费版的 10 毫秒（见调研） |
| 每个工具只查它需要的记录，不一次读出全部历史 | 实测 1.4 万条记录光解析就要 27 毫秒；按日期、状态过滤后通常只剩几十到几百条 |
| 表达式索引 | 按日期查不用扫全表，也省 D1 每天的读取额度 |
| 关键词搜索不建全文索引 | 一个人的任务、收支、副业通常几千条，D1 扫一遍是毫秒级，耗的是 D1 的读取额度而不是 Worker 的 CPU；以后数据量大了再加 |
| `/mcp` 只认访问令牌 | 网页登录态不该被 AI 协议入口借用；令牌有权限档、能单独撤销 |
| 权限三档，新建默认「只能提议」 | 让用户先看 AI 怎么改，放心了再放开 |
| 删除和超过 10 条的修改先预览 | 防止 AI 一次误改一大片；新版协议的弹窗确认要客户端支持，先用两步确认保证所有客户端都能用 |
| 每次写工具最多 20 条输入、25 条改动 | 免费版每个请求最多约 50 次查询；20 条输入可能附带停计时器、补投入这类改动，改动上限放到 25，加上鉴权、查询、改动记录仍有余量 |
| `plan_day` 不给任务时先排这天已计划的 | 和今天页「自动排进时间线」一致；规格评审指出原来直接拉建议会把别的日子的任务、甚至「想法」拉进来 |
| 副业引用传空字符串按「不属于任何副业」 | 模型常用空字符串表示「没有」；原来会被当成所有名称的开头，只有一个副业时悄悄挂上去 |
| 同一个显示编号对应多个任务时报歧义 | 离线两台设备可能各建出同号任务，悄悄取一个会改错 |
| 业务规则抽成 `src/domain/operations/` 共用 | AI 和界面改数据的规则只写一份，不会一边改了另一边忘了 |
| 工具文字用英文 | 各家模型对英文工具说明理解最稳；输出里的标题、备注保持用户原文 |
| 不做「替你操心」类的汇总分析、使用提示（prompts）和聊天里的界面卡片 | 用户决定：分析交给 AI 用查询工具自己做；聊天卡片不做 |

## 当前实现

- 协议：官方 SDK `@modelcontextprotocol/server` 2.2.0 的 `createMcpHandler`，老版本客户端按无状态方式服务（`initialize` 的响应是单条 SSE 事件，规范允许）；新版 `server/discover` 返回 `supportedVersions: ["2026-07-28"]`、能力、使用说明。工具输入一律用 `fromJsonSchema` 加 SDK 自带的 Worker 校验器，在模块顶层编译一次并 `preloadSchemas()`。服务名 `DeverDesk`，版本取 `package.json`。
- 身份和依赖：令牌身份经 SDK 的 `authInfo` 传进工厂和工具；数据源、时钟、改动记录服务、时间、编号生成都从依赖对象注入（`deps.ts` 是生产装配，测试注入替身）。模块顶层只放编译好的输入定义、时区格式化缓存和固定的工具清单，不缓存任何请求的身份和数据。
- 写工具：框架检查改动不超过 25 条（`MAX_CHANGES_PER_CALL`），删除类和超过 10 条的走预览；全部冲突没生效时，返回的说明会写明「没有任何改动生效」，部分生效写明生效几条、跳过几条。
- 查询：`DataSource` 除了按条件查明细，还有两个汇总查询：按副业数任务、按任务汇总投入分钟（逐段按 `minutesOf` 四舍五入、负数按 0 再求和，和界面算法一致）。关键词过滤用 `instr(lower(…), lower(?))`（D1 线上的 LIKE 匹配串上限 50 字节，长关键词会直接报错）。缺字段或坏 JSON 的行按种类做最小形状检查后跳过，不让一条坏数据拖垮整个工具。
- 时区：`createClock` 按 UTC 自然日缓存偏移，只有夏令时切换那天逐个精确算（6800 个时间戳换算从 69 毫秒降到 14 毫秒）；秋天回拨重复的那一小时一律取更早的那一刻；418 个时区 2020–2030 年的切换点经评审逐分钟核过。
- 工具：22 个工具全部实现，读工具 8 个、随手记 6 个、排时间与管理 7 个、改动管理 1 个；共用小件（输出形状、找记录、造改动、输入片段、日期校验）在 `worker/mcp/tools/shared/`。
- CPU（Node 回放，只算 Worker 侧的解析和计算，不含 D1 执行查询）：一年普通数据量（约 4400 条记录）下 8 个读工具都在 7.6 毫秒内，`get_day` 2.5 毫秒；三年重度数据量（约 1.4 万条）下全部在 10 毫秒内，`get_day` 3.7 毫秒、`get_stats` 6.9 毫秒、`query_records` 8.1 毫秒。协议本身每个请求约 1.4–2 毫秒。

## 验证方式

- 现状：`pnpm test` 67 个文件 457 条通过；`pnpm e2e` 24/24 通过（联调后修正之后重跑过）；联调后修正还在本机 dev 服务上用 Claude Code 实连逐项回测过；本地版交互核对 41/41 通过；官方一致性测试里适用于「只提供工具」服务的场景全过，新版协议的关键检查直接对 Worker 测都正确；用 Claude Code（Haiku 模型）实连跑通「看今天 → 记一笔 → 建两个任务 → 排进时间线 → 标完成 → 撤销」，服务器上的改动记录和预期一致。Codex 实连留到用户验收时做（当时本机已有 Codex 在运行，按本机约定不能同时再起一个）。
- `pnpm test`：工具逐个测（用内存数据源，固定时间和时区）、时区换算、共用操作函数（含 store 改造前后行为一致）、协议入口（鉴权、Origin、权限过滤、新老两代请求各走一遍）。
- `pnpm build && pnpm e2e`：本机起 wrangler，三档令牌各连一次，覆盖读工具、提议后在页面采纳、直接改后撤销、删除先预览再确认、只看档不能写、网页登录态不能用 `/mcp`。
- 一致性测试：`npx @modelcontextprotocol/conformance server --url http://127.0.0.1:<端口>/mcp`（带令牌）；`npx @modelcontextprotocol/inspector --cli … --method tools/list`。
- 真实客户端：用 Claude Code 和 Codex 各连一次，跑「记一笔、建任务、排今天、撤销」。

## 待扩展项

- OAuth 授权，让 Claude 网页版、手机版和 ChatGPT 能连（M7）。
- 支持弹窗确认的客户端，删除时改用新版协议的「多轮请求」直接问用户。
- 给常用工具补输出定义（`outputSchema`）。
- 写代码时自动记工时和任务（M6，见 [编程自动记录](编程自动记录.md)）。

## 改动历史

- 2026-10-01：首版设计：接入方式、权限三档、22 个工具、按需查询、时区、共用业务规则。规格评审后修改：投入记录换算墙上时间时按开始时刻的偏移整体平移；改任务状态明确走「切换状态」规则；写明搜索不建全文索引的取舍。
- 2026-10-02：第一期实现完成。评审后修改：D1 关键词过滤改用 instr；时钟加按天的偏移缓存、重复的一小时统一取更早的一刻；坏数据行跳过；读工具减少查回来的行并加两个汇总查询（三年重度数据下 `get_day` 从 22 毫秒降到 3.7 毫秒）；写工具修了 14 处（已完成的任务再标完成会改完成时间、按序号删子任务删错、跨午夜补记被拒、`allowDuplicates` 连外部单号也放开、空字符串副业引用误匹配、同号任务不报歧义、`plan_day` 默认候选等）；改动全部冲突时的说明文字。
- 2026-10-02（联调后修正）：用 Claude Code 实连把 22 个工具逐个测了一遍，据此修了：周复盘里已完成任务的完成时间被时区多平移一次（东八区晚 8 小时）；周复盘每天的计划时长算上例行事项，和今天页、本周页一致；金额合计和时薪统一取到分，不再带浮点尾数；统计的 `range` 改为最近 7/30/90/365 天滚动对比紧挨在前面的同样长的一段；读取接口带上任务备注和子任务的编号、标题、是否完成；字段搭配出错时报人话（跨字段规则从五个工具的参数定义移到执行时检查，补上缺失的「至少改一项」检查，加守卫测试保证新增工具也不能把搭配规则写进参数定义）。
- 2026-10-02（发布后打里程碑）：`get_project` 返回完整的里程碑清单（`milestones.items`）；`manage_project` 的 `milestone` 参数说明写明可以用编号或标题；使用说明提醒「发布之后恰好有一个里程碑对得上就标成完成，对不上或有几个候选先问」。配套的会话简报和插件说明见 [编程记录接口与显示](编程记录接口与显示.md)、[编程记录接入](编程记录接入.md)。
