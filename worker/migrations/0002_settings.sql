-- 只存在服务器端的设置。目前只有会话签名密钥：首次用到时随机生成，
-- 登录 Cookie 的签名同时依赖它和口令，光知道算法和猜口令伪造不出能用的 Cookie。
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
