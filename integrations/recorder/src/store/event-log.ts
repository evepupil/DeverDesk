import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { RecorderEvent } from "../core/types"

const MAX_LINE_BYTES = 4000
const TRUNCATABLE_FIELDS = ["text", "summary", "body", "subject", "title"] as const

/** 追加一个事件；单行超出 4 KB 时尽量截断字段，否则记录本机错误并跳过。 */
export function appendEvent(home: string, event: RecorderEvent): void {
  try {
    const directory = join(home, "events")
    mkdirSync(directory, { recursive: true })
    const date = new Date(event.t).toISOString().slice(0, 10)
    const line = encodeEvent(event)
    if (!line) {
      logAppendFailure(home, "event dropped: JSONL line exceeds 4 KB")
      return
    }
    appendFileSync(join(directory, `${date}.jsonl`), line, "utf8")
  } catch (error) {
    logAppendFailure(home, `event append failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 读最近 days 天的事件（days 为 undefined 读全部），按仓库提交号或会话事件去重，按时间排序；坏行跳过 */
export function readEvents(home: string, options: { days?: number; now?: number }): RecorderEvent[] {
  const directory = join(home, "events")
  let names: string[]
  try {
    names = readdirSync(directory).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort()
  } catch {
    return []
  }

  if (options.days !== undefined) {
    const now = new Date(options.now ?? Date.now())
    const cutoff = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - Math.max(0, Math.floor(options.days)) - 1,
    )
    names = names.filter((name) => Date.parse(`${name.slice(0, 10)}T00:00:00.000Z`) >= cutoff)
  }

  const seen = new Set<string>()
  const events: RecorderEvent[] = []
  for (const name of names) {
    let contents: string
    try {
      contents = readFileSync(join(directory, name), "utf8")
    } catch {
      continue
    }
    for (const line of contents.split(/\r?\n/)) {
      if (!line) continue
      try {
        const event = JSON.parse(line) as RecorderEvent
        if (!event || typeof event !== "object" || typeof event.t !== "number") continue
        const key = event.kind === "commit"
          ? `commit|${event.repo}|${event.sha}`
          : `${event.agent}|${event.session}|${event.kind}|${event.t}`
        if (seen.has(key)) continue
        seen.add(key)
        events.push(event)
      } catch {
        // 一行损坏不影响同一文件的其他事件。
      }
    }
  }

  return events.map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.t - b.event.t || a.index - b.index)
    .map(({ event }) => event)
}

function encodeEvent(event: RecorderEvent): string | undefined {
  const value: Record<string, unknown> = { ...event }
  const serialize = (): string => `${JSON.stringify(value)}\n`
  let line = serialize()
  if (Buffer.byteLength(line, "utf8") <= MAX_LINE_BYTES) return line

  for (const field of TRUNCATABLE_FIELDS) {
    const original = value[field]
    if (typeof original !== "string" || original.length === 0) continue
    const characters = Array.from(original)
    let low = 0
    let high = characters.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      value[field] = characters.slice(0, middle).join("")
      if (Buffer.byteLength(serialize(), "utf8") <= MAX_LINE_BYTES) low = middle
      else high = middle - 1
    }
    value[field] = characters.slice(0, low).join("")
    line = serialize()
    if (Buffer.byteLength(line, "utf8") <= MAX_LINE_BYTES) return line
  }
  return undefined
}

function logAppendFailure(home: string, message: string): void {
  try {
    const logs = join(home, "logs")
    mkdirSync(logs, { recursive: true })
    appendFileSync(join(logs, "recorder.log"), `${new Date().toISOString()} ${message}\n`, "utf8")
  } catch {
    // Append failures must not escape into the host hook.
  }
}
