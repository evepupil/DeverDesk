// i18n-ignore-file：这里的中文是快速添加认的输入写法（今天、周五、30分钟……），不是界面文字
import { getT } from "../i18n/runtime"
import { addDays, dayKeyOf, formatRelativeDay, parseDay, weekStart } from "./calendar"
import type { DayKey, Priority, Project } from "./types"

/**
 * 快速添加的解析：「写周报 30m #技术博客 明天 !!」「Write weekly report 30m #blog tomorrow !!」
 * 识别时长（30m、1.5h、1h30m、2小时、45min、2hr）、副业（#开头）、
 * 日期（今天、明天、周五、下周二、10-3、10月3日；today、tomorrow、fri、friday、next tue）
 * 和优先级（! 中、!! 高、!!! 紧急）。不管界面是什么语言，中英文写法都认。
 * 标记之间用空格隔开，其余文字就是标题；标记的显示文字按当前语言。
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
/** 英文星期全名：下标 0 是周一，和上面的中文对齐 */
const EN_WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

function parseDuration(token: string): number | null {
  const lower = token.toLowerCase()
  let match = lower.match(/^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours|小时)$/)
  if (match) return Math.round(Number(match[1]) * 60)
  match = lower.match(/^(\d+)(m|min|mins|minute|minutes|分钟|分)$/)
  if (match) return Number(match[1])
  match = lower.match(/^(\d+)h(\d+)m$/)
  if (match) return Number(match[1]) * 60 + Number(match[2])
  return null
}

function weekdayIndex(char: string): number {
  return WEEKDAYS.indexOf(char === "天" ? "日" : char)
}

/** 英文星期（mon、monday、tues、thurs 等）是周几，周一为 0；认不出为 -1 */
function englishWeekdayIndex(word: string): number {
  const lower = word.toLowerCase()
  const full = EN_WEEKDAY_NAMES.indexOf(lower)
  if (full >= 0) return full
  if (lower.length < 3) return -1
  return EN_WEEKDAY_NAMES.findIndex((name) => name.startsWith(lower))
}

/** 本周或之后最近的那个星期几 */
function upcomingWeekday(index: number, today: DayKey): DayKey {
  const day = addDays(weekStart(today), index)
  return day >= today ? day : addDays(day, 7)
}

function parseEnglishDate(token: string, today: DayKey): DayKey | null {
  const lower = token.toLowerCase()
  if (lower === "today" || lower === "tod") return today
  if (lower === "tomorrow" || lower === "tmr" || lower === "tmrw") return addDays(today, 1)
  const next = lower.match(/^next[-_]?([a-z]+)$/)
  if (next) {
    const index = englishWeekdayIndex(next[1])
    return index >= 0 ? addDays(weekStart(today), 7 + index) : null
  }
  if (!/^[a-z]+$/.test(lower)) return null
  const index = englishWeekdayIndex(lower)
  return index >= 0 ? upcomingWeekday(index, today) : null
}

function parseDate(token: string, today: DayKey): DayKey | null {
  if (token === "今天") return today
  if (token === "明天") return addDays(today, 1)
  if (token === "后天") return addDays(today, 2)
  if (token === "大后天") return addDays(today, 3)

  const english = parseEnglishDate(token, today)
  if (english) return english

  let match = token.match(/^下(?:周|星期)([一二三四五六日天])$/)
  if (match) {
    const index = weekdayIndex(match[1])
    if (index >= 0) return addDays(weekStart(today), 7 + index)
  }
  match = token.match(/^(?:周|星期)([一二三四五六日天])$/)
  if (match) {
    const index = weekdayIndex(match[1])
    if (index >= 0) return upcomingWeekday(index, today)
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
  const words = getT().quickAdd

  // 「next tue」是两个词：先并成一个标记再逐个识别
  const raw = input.trim().split(/\s+/).filter(Boolean)
  const tokens: string[] = []
  for (let index = 0; index < raw.length; index++) {
    const following = raw[index + 1]
    if (raw[index].toLowerCase() === "next" && following && englishWeekdayIndex(following) >= 0) {
      tokens.push(`${raw[index]} ${following}`)
      index++
    } else {
      tokens.push(raw[index])
    }
  }

  for (const token of tokens) {
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
        result.tokens.push({
          kind: "estimate",
          text: token,
          label: minutes >= 60 ? words.hours(Number((minutes / 60).toFixed(1))) : words.minutes(minutes),
        })
        continue
      }
    }
    if (result.plannedFor === null) {
      const day = parseDate(token.replace(/^next /i, "next-"), today)
      if (day) {
        result.plannedFor = day
        result.tokens.push({ kind: "date", text: token, label: formatRelativeDay(day, today) })
        continue
      }
    }
    if (result.priority === null && /^!{1,3}$/.test(token)) {
      result.priority = (token.length + 1) as Priority
      result.tokens.push({ kind: "priority", text: token, label: words.priority[(token.length + 1) as 2 | 3 | 4] })
      continue
    }
    rest.push(token)
  }

  result.title = rest.join(" ")
  return result
}
