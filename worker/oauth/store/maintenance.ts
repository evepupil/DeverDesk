// 限速计数和过期数据清理。

/**
 * 在一个时间窗口里给某个键计一次数，返回计完之后的次数；
 * 窗口过了就从 1 重新数。调用方拿次数和上限比。
 */
export async function countHit(db: D1Database, key: string, windowMs: number, now: number): Promise<number> {
  const cutoff = now - windowMs
  const row = await db.prepare(
    "INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) " +
    "ON CONFLICT(key) DO UPDATE SET " +
    "count = CASE WHEN rate_limits.window_start <= ? THEN 1 ELSE rate_limits.count + 1 END, " +
    "window_start = CASE WHEN rate_limits.window_start <= ? THEN excluded.window_start ELSE rate_limits.window_start END " +
    "RETURNING count",
  ).bind(key, now, cutoff, cutoff).first<{ count: number }>()
  if (!row) throw new Error("rate limit counter returned no row")
  return row.count
}

/** 删掉某个前缀下已经过了窗口的计数；前缀匹配写成主键范围，走索引不扫全表 */
export async function deleteStaleHits(db: D1Database, prefix: string, windowMs: number, now: number): Promise<void> {
  const upper = `${prefix.slice(0, -1)}${String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)}`
  await db.prepare("DELETE FROM rate_limits WHERE key >= ? AND key < ? AND window_start <= ?")
    .bind(prefix, upper, now - windowMs)
    .run()
}

/** 删掉过期的授权码、通行令牌，以及过期的连接和它们的令牌 */
export async function deleteExpired(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM oauth_codes WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM oauth_tokens WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM oauth_tokens WHERE grant_id IN (SELECT id FROM oauth_grants WHERE refresh_expires_at <= ?)").bind(now),
    db.prepare("DELETE FROM oauth_grants WHERE refresh_expires_at <= ?").bind(now),
  ])
}
