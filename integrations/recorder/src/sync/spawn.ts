import { mkdirSync, closeSync, openSync, readdirSync, statSync, unlinkSync, writeSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { recorderHome } from "../store/paths"

const MAX_DELAY_MS = 20 * 60_000
const DEDUPE_WINDOW_MS = 30_000
const RETAIN_AFTER_DUE_MS = 5 * 60_000

/** 分离启动同步进程；延迟任务用本机到期锁去重。 */
export function spawnBackgroundSync(
  execPath: string,
  scriptPath: string,
  env: Record<string, string | undefined>,
  options: { delayMs?: number; onError?: (error: Error) => void } = {},
): void {
  const delayMs = options.delayMs === undefined ? undefined : Math.max(0, Math.min(MAX_DELAY_MS, options.delayMs))
  const home = recorderHome(env)
  const dueAt = delayMs ? Date.now() + delayMs : undefined
  let reservation: string | undefined
  if (delayMs && dueAt !== undefined) {
    if (!reserveSettleSlot(home, dueAt)) return
    reservation = join(home, `settle-${dueAt}.lock`)
  }

  try {
    const args = [scriptPath, "sync", ...(delayMs ? ["--delay", String(delayMs)] : [])]
    const childEnv = {
      ...env,
      ...(reservation ? { DEVERDESK_RECORDER_SETTLE_LOCK: reservation } : {}),
    }
    // 工作目录放到记录器家目录：分离的同步进程可能睡 20 分钟，不能占着用户的项目文件夹（Windows 上会让文件夹删不掉、改不了名）
    mkdirSync(home, { recursive: true })
    const child = spawn(execPath, args, { detached: true, stdio: "ignore", windowsHide: true, env: childEnv, cwd: home })
    child.once("error", (error) => {
      releaseReservation()
      try {
        options.onError?.(error)
      } catch {
        // 子进程启动失败不能反向影响钩子。
      }
    })
    child.unref()
  } catch (error) {
    releaseReservation()
    throw error
  }

  function releaseReservation(): void {
    if (!reservation) return
    try {
      unlinkSync(reservation)
    } catch {
      // 另一个清理者可能已经删除。
    }
  }
}

function reserveSettleSlot(home: string, dueAt: number): boolean {
  mkdirSync(home, { recursive: true })
  const gate = join(home, "settle-index.lock")
  let descriptor = openGate(gate)
  if (descriptor === null) {
    try {
      if (Date.now() - statSync(gate).mtimeMs > 10_000) unlinkSync(gate)
    } catch {
      return false
    }
    descriptor = openGate(gate)
    if (descriptor === null) return false
  }

  try {
    for (const name of readdirSync(home)) {
      const match = /^settle-(\d+)\.lock$/.exec(name)
      if (!match?.[1]) continue
      const existingDue = Number(match[1])
      const path = join(home, name)
      if (existingDue + RETAIN_AFTER_DUE_MS < Date.now()) {
        try {
          unlinkSync(path)
        } catch {
          // 另一个清理者可能已经删除。
        }
      } else if (Math.abs(existingDue - dueAt) <= DEDUPE_WINDOW_MS) {
        return false
      }
    }
    const reservation = join(home, `settle-${dueAt}.lock`)
    let lock: number
    try {
      lock = openSync(reservation, "wx")
    } catch {
      return false
    }
    writeSync(lock, `${process.pid} ${dueAt}\n`)
    closeSync(lock)
    return true
  } finally {
    closeSync(descriptor)
    try {
      unlinkSync(gate)
    } catch {
      // 其他调用会在 gate 消失后继续。
    }
  }
}

function openGate(path: string): number | null {
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
      // 创建 gate 失败时尽力清理残留。
    }
    return null
  }
}
