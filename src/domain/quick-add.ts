import { addDays, dayKeyOf, formatRelativeDay, parseDay, weekStart } from "./calendar"
import type { DayKey, Priority, Project } from "./types"

/**
 * 快速添加的解析：「写周报 30m #技术博客 明天 !!」
 * 识别时长（30m、1.5h、1h30m、2小时）、副业（#开头）、日期（今天、明天、周五、下周二、10-3、10月3日）
 * 和优先级（! 中、!! 高、!!! 紧急）。标记之间用空格隔开，其余文字就是标题。
 */

export type QuickTokenKind = "estimate" | "project" | "date" | "priority"

export interface QuickToken {
  kind: QuickTokenKind
  text: string
  label: string
}

export interface QuickAddResult {
  title: string
  estimateMin: number | null
  projectId: string | null
  plannedFor: DayKey | null
  priority: Priority | null
  tokens: QuickToken[]
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]
const PRIORITY_LABEL: Record<number, string> = { 2: "中优先", 3: "高优先", 4: "紧急" }

function parseDuration(token: string): number | null {
  const lower = token.toLowerCase()
  let match = lower.match(/^(\d+(?:\.\d+)?)(h|小时)$/)
  if (match) return Math.round(Number(match[1]) * 60)
  match = lower.match(/^(\d+)(m|min|分钟|分)$/)
  if (match) return Number(match[1])
  match = lower.match(/^(\d+)h(\d+)m$/)
  if (match) return Number(match[1]) * 60 + Number(match[2])
  return null
}

function weekdayIndex(char: string): number {
  return WEEKDAYS.indexOf(char === "天" ? "日" : char)
}

function parseDate(token: string, today: DayKey): DayKey | null {
  if (token === "今天") return today
  if (token === "明天") return addDays(today, 1)
  if (token === "后天") return addDays(today, 2)
  if (token === "大后天") return addDays(today, 3)

  let match = token.match(/^下(?:周|星期)([一二三四五六日天])$/)
  if (match) {
    const index = weekdayIndex(match[1])
    if (index >= 0) return addDays(weekStart(today), 7 + index)
  }
  match = token.match(/^(?:周|星期)([一二三四五六日天])$/)
  if (match) {
    const index = weekdayIndex(match[1])
    if (index >= 0) {
      const day = addDays(weekStart(today), index)
      return day >= today ? day : addDays(day, 7)
    }
  }

  match = token.match(/^(\d{1,2})[-/.](\d{1,2})$/) ?? token.match(/^(\d{1,2})月(\d{1,2})[日号]?$/)
  if (match) {
    const month = Number(match[1])
    const date = Number(match[2])
    if (month < 1 || month > 12 || date < 1 || date > 31) return null
    const year = parseDay(today).getFullYear()
    let candidate = dayKeyOf(new Date(year, month - 1, date))
    if (candidate < today) candidate = dayKeyOf(new Date(year + 1, month - 1, date))
    return candidate
  }
  return null
}

function matchProject(name: string, projects: Project[]): Project | null {
  const q = name.toLowerCase()
  return (
    projects.find((project) => project.name.toLowerCase() === q) ??
    projects.find((project) => project.name.toLowerCase().startsWith(q)) ??
    projects.find((project) => project.name.toLowerCase().includes(q)) ??
    null
  )
}

export function parseQuickAdd(input: string, projects: Project[], today: DayKey): QuickAddResult {
  const result: QuickAddResult = {
    title: "",
    estimateMin: null,
    projectId: null,
    plannedFor: null,
    priority: null,
    tokens: [],
  }
  const rest: string[] = []

  for (const token of input.trim().split(/\s+/).filter(Boolean)) {
    if (result.projectId === null && token.startsWith("#") && token.length > 1) {
      const project = matchProject(token.slice(1), projects)
      if (project) {
        result.projectId = project.id
        result.tokens.push({ kind: "project", text: token, label: project.name })
        continue
      }
    }
    if (result.estimateMin === null) {
      const minutes = parseDuration(token)
      if (minutes !== null && minutes > 0) {
        result.estimateMin = minutes
        result.tokens.push({ kind: "estimate", text: token, label: minutes >= 60 ? `${Number((minutes / 60).toFixed(1))} 小时` : `${minutes} 分钟` })
        continue
      }
    }
    if (result.plannedFor === null) {
      const day = parseDate(token, today)
      if (day) {
        result.plannedFor = day
        result.tokens.push({ kind: "date", text: token, label: formatRelativeDay(day, today) })
        continue
      }
    }
    if (result.priority === null && /^!{1,3}$/.test(token)) {
      result.priority = (token.length + 1) as Priority
      result.tokens.push({ kind: "priority", text: token, label: PRIORITY_LABEL[token.length + 1] })
      continue
    }
    rest.push(token)
  }

  result.title = rest.join(" ")
  return result
}
