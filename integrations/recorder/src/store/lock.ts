import { closeSync, openSync, statSync, unlinkSync, writeSync } from "node:fs"

function createLock(path: string): number | null {
  let descriptor: number
  try {
    descriptor = openSync(path, "wx")
  } catch {
    return null
  }
  try {
    writeSync(descriptor, `${process.pid} ${Date.now()}\n`)
    return descriptor
  } catch {
    closeSync(descriptor)
    try {
      unlinkSync(path)
    } catch {
      // 文件创建失败时尽力清理残留锁。
    }
    return null
  }
}

export async function withLockWait<T>(path: string, staleMs: number, timeoutMs: number, fn: () => Promise<T>): Promise<{ value: T } | null> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    const result = await withLock(path, staleMs, fn)
    if (result) return result
    if (Date.now() >= deadline) return null
    await new Promise((resolve) => setTimeout(resolve, Math.min(25, deadline - Date.now())))
  }
}

/** 拿到锁就执行 fn 并释放；拿不到（别人持有且没过期）返回 null */
export async function withLock<T>(path: string, staleMs: number, fn: () => Promise<T>): Promise<{ value: T } | null> {
  let descriptor = createLock(path)
  if (descriptor === null) {
    let stale = false
    try {
      stale = Date.now() - statSync(path).mtimeMs > staleMs
    } catch {
      stale = false
    }
    if (!stale) return null
    try {
      unlinkSync(path)
    } catch {
      return null
    }
    descriptor = createLock(path)
    if (descriptor === null) return null
  }

  closeSync(descriptor)
  try {
    return { value: await fn() }
  } finally {
    try {
      unlinkSync(path)
    } catch {
      // 释放失败不能覆盖 fn 的结果或异常。
    }
  }
}
