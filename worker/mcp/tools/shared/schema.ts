// 工具输入 JSON Schema 的公共片段（JSON Schema 2020-12）：各工具拼 inputSchema 时直接引用，
// 保证同一种字段（日期、时间、优先级、引用……）在 22 个工具里形状和说明一致。
// 说明用英文，和工具说明同一套口径。

export const DAY = {
  type: "string",
  description: "Local calendar day in the user's time zone, format YYYY-MM-DD (e.g. 2026-03-01).",
} as const

export const TIME = {
  type: "string",
  description: "Local time of day, format HH:mm between 00:00 and 23:59 (e.g. 09:30).",
} as const

export const LOCAL_DATETIME = {
  type: "string",
  description: "Local date and time in the user's time zone, format YYYY-MM-DDTHH:mm (e.g. 2026-03-01T09:30).",
} as const

/** 日期加时间，或只给时间（配一个日期字段使用） */
export const LOCAL_DATETIME_OR_TIME = {
  type: "string",
  description:
    "Local date and time (YYYY-MM-DDTHH:mm, e.g. 2026-03-01T09:30) or just a time of day (HH:mm, e.g. 09:30) when a separate date input provides the day.",
} as const

export const PRIORITY = {
  type: "integer",
  minimum: 0,
  maximum: 4,
  description: "Priority: 0 none, 1 low, 2 medium, 3 high, 4 urgent.",
} as const

export const TASK_STATUS = {
  type: "string",
  enum: ["backlog", "todo", "doing", "done", "dropped"],
  description: "Task status: backlog (idea), todo, doing, done, dropped.",
} as const

export const ESTIMATE_MIN = {
  type: "integer",
  minimum: 0,
  maximum: 1440,
  description: "Estimated duration in minutes, 0–1440.",
} as const

export const TASK_TITLE = {
  type: "string",
  minLength: 1,
  maxLength: 80,
  description: "Task title, 1–80 characters.",
} as const

export const NOTES = {
  type: "string",
  maxLength: 2000,
  description: "Free-form notes, up to 2000 characters.",
} as const

export const REASON = {
  type: "string",
  maxLength: 200,
  description: "One short sentence shown to the user explaining why you are making this change, up to 200 characters.",
} as const

export const PROJECT_REF = {
  type: ["string", "null"],
  description:
    "Project reference: internal id or project name (exact match case-insensitive, then unique prefix, then unique substring match); a string must match exactly one project or the call fails. Pass null for no project (personal).",
} as const

export const TASK_REF = {
  type: "string",
  minLength: 1,
  description: "Task reference: internal id (t-…) or display code like T-123 (case-insensitive).",
} as const

export const ROUTINE_REF = {
  type: "string",
  minLength: 1,
  description:
    "Routine reference: internal id or routine title (exact match case-insensitive, then unique prefix, then unique substring match); must match exactly one routine or the call fails.",
} as const

/** 有默认值和最大值的条数字段：上限写进 Schema，SDK 校验超出的输入 */
export function LIMIT(defaultValue: number, max: number) {
  return {
    type: "integer",
    minimum: 1,
    maximum: max,
    default: defaultValue,
    description: `Number of records to return, 1–${max} (default ${defaultValue}).`,
  } as const
}
