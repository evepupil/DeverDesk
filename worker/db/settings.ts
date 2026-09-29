// 服务器端设置：会话签名密钥首次用到时随机生成并存进 D1，之后每个 Worker 实例只读一次。
import { randomBase64Url } from "../auth/crypto"

const SESSION_SECRET = "session_secret"

let cachedSecret: string | null = null

async function readSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function loadSessionSecret(db: D1Database): Promise<string> {
  if (cachedSecret) return cachedSecret
  let secret = await readSetting(db, SESSION_SECRET)
  if (!secret) {
    // 两个请求同时首次生成时只有先写入的那份生效，随后都读回同一份
    await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING")
      .bind(SESSION_SECRET, randomBase64Url(32))
      .run()
    secret = await readSetting(db, SESSION_SECRET)
  }
  if (!secret) throw new Error("session secret was not stored")
  cachedSecret = secret
  return secret
}
