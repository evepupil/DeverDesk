/**
 * 浏览器本地存储。数据修改需要明确告诉用户有没有存上；界面偏好存不上就算了。
 * 地址栏带 ?fail=save 时，第一次保存会故意失败，用来演示失败反馈和重试。
 */

let simulatedFailures = 0

function storage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function armFailureSimulation() {
  if (typeof window === "undefined") return
  const params = new URLSearchParams(window.location.search)
  if (params.get("fail") === "save") simulatedFailures = 1
}

/** 读取带版本号的一份数据；版本不符或读不到时返回 null */
export function loadVersioned<T>(key: string, version: number): T | null {
  try {
    const raw = storage()?.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version?: number; value?: T }
    return parsed.version === version && parsed.value !== undefined ? parsed.value : null
  } catch {
    return null
  }
}

/** 保存带版本号的一份数据，返回是否存上（受 ?fail=save 演示开关影响） */
export function saveVersioned(key: string, version: number, value: unknown): boolean {
  try {
    if (simulatedFailures > 0) {
      simulatedFailures--
      throw new Error("simulated storage failure")
    }
    const target = storage()
    if (!target) throw new Error("storage unavailable")
    target.setItem(key, JSON.stringify({ version, value }))
    return true
  } catch {
    return false
  }
}

export function removeKey(key: string) {
  try {
    storage()?.removeItem(key)
  } catch {
    // 清不掉也不影响内存里的数据
  }
}

/** 偏好这类存不上也无所谓的数据 */
export function loadLoose<T>(key: string): Partial<T> | null {
  try {
    const raw = storage()?.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<T>) : null
  } catch {
    return null
  }
}

export function saveLoose(key: string, value: unknown) {
  try {
    storage()?.setItem(key, JSON.stringify(value))
  } catch {
    // 偏好存不上时保持本次会话有效即可
  }
}
