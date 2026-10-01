-- M4：访问令牌的权限档、AI 改动记录、按 JSON 字段的表达式索引。
-- 规则见 docs/模块设计/AI改动记录.md 与 docs/模块设计/MCP服务.md。

-- 权限档：read 只看、propose 只能提议、write 直接改。
-- 已有的令牌按 write，保持它们原来能建任务、记账的能力。
ALTER TABLE tokens ADD COLUMN tier TEXT NOT NULL DEFAULT 'write';

-- AI 一次操作打成的改动包。
CREATE TABLE ai_changesets (
  id TEXT PRIMARY KEY,
  token_id TEXT,
  client_name TEXT NOT NULL,
  tool TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  -- 每次状态转换写入一个随机编号：同一个 batch 里后面的语句据此确认这次转换是本请求做成的
  decision_id TEXT
);

-- 列表按 (created_at, id) 倒序翻页
CREATE INDEX idx_ai_changesets_created ON ai_changesets (created_at, id);
CREATE INDEX idx_ai_changesets_status ON ai_changesets (status, created_at, id);
CREATE INDEX idx_ai_changesets_token ON ai_changesets (token_id, created_at);

-- 改动包里的每一条改动：改前改后的内容、修改时间和写入顺序号。
-- 冲突检查用写入顺序号（rev，每次写入都不同）；修改时间只用来算新的修改时间。
CREATE TABLE ai_changes (
  changeset_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_data TEXT,
  before_updated_at INTEGER,
  before_rev INTEGER,
  after_data TEXT,
  after_updated_at INTEGER,
  after_rev INTEGER,
  state TEXT NOT NULL,
  PRIMARY KEY (changeset_id, seq)
);

-- 按需查询用的表达式索引，只覆盖没删除的记录。
-- 查询里必须逐字写成 json_extract(data, '$.字段')，并带上 kind = '…' AND deleted = 0，SQLite 才会用上。
CREATE INDEX idx_records_entry_start ON records (json_extract(data, '$.start')) WHERE kind = 'entry' AND deleted = 0;
CREATE INDEX idx_records_ledger_date ON records (json_extract(data, '$.date')) WHERE kind = 'ledger' AND deleted = 0;
CREATE INDEX idx_records_ledger_external ON records (json_extract(data, '$.externalId')) WHERE kind = 'ledger' AND deleted = 0;
CREATE INDEX idx_records_task_status ON records (json_extract(data, '$.status')) WHERE kind = 'task' AND deleted = 0;
CREATE INDEX idx_records_task_planned ON records (json_extract(data, '$.plannedFor')) WHERE kind = 'task' AND deleted = 0;
CREATE INDEX idx_records_task_completed ON records (json_extract(data, '$.completedAt')) WHERE kind = 'task' AND deleted = 0;
