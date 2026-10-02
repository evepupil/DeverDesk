import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http"
import { request as httpsRequest } from "node:https"
import { join } from "node:path"
import type { BriefingMilestone, BriefingResponse, BriefingTask } from "../../../../src/sync/recorder-protocol"
import type { Credentials } from "../store/config"
import { recorderHome } from "../store/paths"

const CACHE_TTL_MS = 10 * 60_000
const BRIEFING_BUDGET_MS = 800

const TASK_REMINDER = "提交说明里写 Closes T-141 之类的编号，这次提交就会把那个任务标成完成；没写编号的提交会自动记成新任务。"
const MILESTONE_REMINDER = "发布之后，如果有一个待完成的里程碑明显对得上（名字或版本号吻合），用 manage_project 的 complete_milestone 把它标成完成并告诉用户；对不上或有几个候选，先问用户。"

interface CacheEntry {
  at: number
  response: BriefingResponse
}

export interface FetchBriefingOptions {
  timeoutMs?: number
  home?: string
  now?: number
}

/** 读取本机十分钟缓存；缓存失效时最多等待 timeoutMs 请求服务器一次。 */
export async function fetchBriefing(
  credentials: Credentials,
  dir: string,
  options: FetchBriefingOptions = {},
): Promise<BriefingResponse | null> {
  const home = options.home ?? recorderHome()
  const now = options.now ?? Date.now()
  const key = dir.toLowerCase()
  try {
    const cache = readCache(home)
    const cached = cache[key]
    if (cached && now >= cached.at && now - cached.at < CACHE_TTL_MS) return cached.response

    const url = new URL(`${credentials.url.replace(/\/+$/, "")}/api/recorder/briefing?dir=${encodeURIComponent(dir)}`)
    const payload = await requestBriefing(url, credentials.token, options.timeoutMs ?? BRIEFING_BUDGET_MS)
    if (!isBriefingResponse(payload)) return null
    cache[key] = { at: now, response: payload }
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, "briefing-cache.json"), `${JSON.stringify(cache)}\n`, { encoding: "utf8", mode: 0o600 })
    return payload
  } catch {
    return null
  }
}

function requestBriefing(url: URL, token: string, timeoutMs: number): Promise<unknown | null> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    let timeout: NodeJS.Timeout | undefined
    const finish = (value: unknown | null): void => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      resolve(value)
    }
    const onResponse = (response: IncomingMessage): void => {
      if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy()
        finish(null)
        return
      }
      response.setEncoding("utf8")
      let body = ""
      response.on("data", (chunk: string) => { body += chunk })
      response.once("aborted", () => finish(null))
      response.once("error", () => finish(null))
      response.once("end", () => {
        if (!response.complete) {
          finish(null)
          return
        }
        try {
          finish(JSON.parse(body) as unknown)
        } catch {
          finish(null)
        }
      })
    }
    try {
      const options: RequestOptions = { method: "GET", headers: { Authorization: `Bearer ${token}` } }
      const request = url.protocol === "https:"
        ? httpsRequest(url, options, onResponse)
        : httpRequest(url, options, onResponse)
      request.once("error", () => finish(null))
      timeout = setTimeout(() => {
        finish(null)
        request.destroy()
      }, timeoutMs)
      request.end()
    } catch {
      finish(null)
    }
  })
}

/** 按 hook 简报约定生成短中文上下文。 */
export function formatBriefing(briefing: BriefingResponse): string {
  if (!briefing.bound) return ""
  const more = briefing.more ?? { plannedToday: 0, overdue: 0, open: 0 }
  const milestones = briefing.milestones ?? []
  const hasMilestones = milestones.length > 0 || (more.milestones ?? 0) > 0
  const blocks: string[] = []
  if (briefing.project) {
    blocks.push(`DeverDesk · 副业「${briefing.project.name}」（${stageLabel(briefing.project.stage)}）`)
  }

  const shown = new Set<string>()
  const countLabel = (count: number) => count > 0 ? `（另有 ${count} 项）` : ""
  if (briefing.plannedToday.length > 0 || more.plannedToday > 0) {
    blocks.push(`今天计划${countLabel(more.plannedToday)}：${briefing.plannedToday.map((task) => {
      shown.add(task.code)
      return `${task.code} ${task.title}（${task.estimateMin}m，${priorityLabel(task.priority)}）`
    }).join("；")}`)
  }
  if (briefing.overdue.length > 0 || more.overdue > 0) {
    blocks.push(`已逾期${countLabel(more.overdue)}：${briefing.overdue.map((task) => {
      shown.add(task.code)
      return `${task.code} ${task.title}${task.dueOn ? `（截止 ${task.dueOn.slice(5)}` + "）" : ""}`
    }).join("；")}`)
  }
  // 里程碑放在「其他没做完的」前面：后者最长，预算紧的时候先舍它
  if (hasMilestones) {
    blocks.push(`待完成的里程碑${countLabel(more.milestones ?? 0)}：${milestones.map((milestone) => `${milestone.title}（截止 ${milestone.due.slice(5)}）`).join("；")}`)
  }
  const otherOpen = briefing.open.filter((task) => !shown.has(task.code)).slice(0, 15)
  if (otherOpen.length > 0 || more.open > 0) {
    blocks.push(`其他没做完的${countLabel(more.open)}：${otherOpen.map((task) => `${task.code} ${task.title}`).join("；")}`)
  }
  // 提醒永远留着，任务编号的提醒永远是最后一行
  const reminders = hasMilestones ? [MILESTONE_REMINDER, TASK_REMINDER] : [TASK_REMINDER]
  const notice = "简报有内容未显示"
  const selected: string[] = []
  const lengthOf = (lines: string[]) => Array.from(lines.join("\n")).length
  let truncated = false
  for (const block of blocks) {
    if (lengthOf([...selected, block, ...reminders]) <= 1200) selected.push(block)
    else truncated = true
  }
  if (truncated) {
    while (selected.length > 0 && lengthOf([...selected, notice, ...reminders]) > 1200) selected.pop()
    return [...selected, notice, ...reminders].join("\n")
  }
  return [...selected, ...reminders].join("\n")
}

function readCache(home: string): Record<string, CacheEntry> {
  try {
    const value: unknown = JSON.parse(readFileSync(join(home, "briefing-cache.json"), "utf8"))
    if (!isRecord(value)) return {}
    const entries: Record<string, CacheEntry> = {}
    for (const [key, item] of Object.entries(value)) {
      if (!isRecord(item) || typeof item.at !== "number" || !isBriefingResponse(item.response)) continue
      entries[key] = { at: item.at, response: item.response }
    }
    return entries
  } catch {
    return {}
  }
}

function isBriefingResponse(value: unknown): value is BriefingResponse {
  if (!isRecord(value) || typeof value.bound !== "boolean" || typeof value.today !== "string") return false
  if (!Array.isArray(value.plannedToday) || !value.plannedToday.every(isBriefingTask)) return false
  if (!Array.isArray(value.overdue) || !value.overdue.every(isBriefingTask)) return false
  if (!Array.isArray(value.open) || !value.open.every(isBriefingTask)) return false
  // 老版本服务器和老的本机缓存没有 milestones，缺了就当没有
  if (value.milestones !== undefined && (!Array.isArray(value.milestones) || !value.milestones.every(isBriefingMilestone))) return false
  if (value.more !== undefined && !isBriefingMore(value.more)) return false
  if (value.project === undefined) return true
  return isRecord(value.project) && typeof value.project.id === "string" && typeof value.project.name === "string"
    && typeof value.project.stage === "string" && ["idea", "building", "running", "paused", "ended"].includes(value.project.stage)
}

function isBriefingMore(value: unknown): value is NonNullable<BriefingResponse["more"]> {
  return isRecord(value)
    && Number.isSafeInteger(value.plannedToday) && (value.plannedToday as number) >= 0
    && Number.isSafeInteger(value.overdue) && (value.overdue as number) >= 0
    && Number.isSafeInteger(value.open) && (value.open as number) >= 0
    && (value.milestones === undefined || (Number.isSafeInteger(value.milestones) && (value.milestones as number) >= 0))
}

function isBriefingMilestone(value: unknown): value is BriefingMilestone {
  return isRecord(value) && typeof value.title === "string" && typeof value.due === "string"
}

function isBriefingTask(value: unknown): value is BriefingTask {
  return isRecord(value)
    && typeof value.code === "string"
    && typeof value.title === "string"
    && typeof value.status === "string" && ["backlog", "todo", "doing", "done", "dropped"].includes(value.status)
    && typeof value.priority === "number" && Number.isInteger(value.priority) && value.priority >= 0 && value.priority <= 4
    && typeof value.estimateMin === "number" && Number.isFinite(value.estimateMin) && value.estimateMin >= 0
    && (value.plannedFor === null || typeof value.plannedFor === "string")
    && (value.dueOn === null || typeof value.dueOn === "string")
}

function stageLabel(stage: NonNullable<BriefingResponse["project"]>["stage"]): string {
  const labels: Record<string, string> = { idea: "构思中", building: "搭建中", running: "运营中", paused: "暂停", ended: "已结束" }
  return labels[stage] ?? String(stage)
}

function priorityLabel(priority: BriefingTask["priority"]): string {
  return ["无", "低", "中", "高", "紧急"][priority] ?? "无"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
