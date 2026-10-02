-- M7：OAuth 授权。规则见 docs/模块设计/OAuth授权.md。
-- 授权码、通行令牌、续期令牌、客户端密钥一律只存 SHA-256 摘要。

-- 自助登记的客户端；编号是网址的「身份说明」类客户端不落库
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- 跳回地址，JSON 数组
  redirect_uris TEXT NOT NULL,
  -- none / client_secret_basic / client_secret_post
  auth_method TEXT NOT NULL,
  secret_hash TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

-- 授权码：5 分钟有效、只能用一次；换过令牌后记下建出的连接，留到过期，用来发现重复使用
CREATE TABLE oauth_codes (
  hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_host TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  tier TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  grant_id TEXT
);

CREATE INDEX idx_oauth_codes_expires ON oauth_codes (expires_at);

-- 连接：一次「允许」一条，和个人令牌一起出现在「连接 AI」列表里
CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_host TEXT NOT NULL,
  tier TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  -- 当前的续期令牌；上一张在当前这张第一次被使用前仍然有效
  refresh_hash TEXT NOT NULL UNIQUE,
  previous_refresh_hash TEXT,
  refresh_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX idx_oauth_grants_previous ON oauth_grants (previous_refresh_hash);
CREATE INDEX idx_oauth_grants_client ON oauth_grants (client_id);
CREATE INDEX idx_oauth_grants_expires ON oauth_grants (refresh_expires_at);

-- 通行令牌：1 小时有效；续期交替时同一条连接可能同时有几张
CREATE TABLE oauth_tokens (
  hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_oauth_tokens_grant ON oauth_tokens (grant_id);
CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens (expires_at);

-- 通用限速计数，键如 register:<IP>
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
