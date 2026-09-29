-- 在线版 D1 数据库的同步记录、个人令牌和登录失败计数表。
CREATE TABLE records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'app',
  PRIMARY KEY (kind, id)
);

CREATE INDEX idx_records_rev ON records (rev);

CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE login_failures (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
