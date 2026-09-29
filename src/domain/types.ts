/** 标签颜色：只落在小色点、副业方块和时间块的色条上 */
export type LabelColor =
  | "red"
  | "orange"
  | "amber"
  | "green"
  | "teal"
  | "blue"
  | "indigo"
  | "violet"
  | "pink"
  | "gray"

/** 本地日历日：YYYY-MM-DD，按浏览器所在时区计算 */
export type DayKey = string

/** 任务状态：想法、待办、进行中、已完成、已搁置 */
export type TaskStatus = "backlog" | "todo" | "doing" | "done" | "dropped"

/** 优先级：0 无，1 低，2 中，3 高，4 紧急 */
export type Priority = 0 | 1 | 2 | 3 | 4

/** 副业阶段：构思、搭建中、运营中、暂停、已结束 */
export type ProjectStage = "idea" | "building" | "running" | "paused" | "ended"

/** 例行频率：每天、工作日、每周、每月 */
export type Cadence = "daily" | "weekdays" | "weekly" | "monthly"

export type EntryKind = "income" | "expense"
/** 收支状态：待到账、已到账（支出为已支付）、已退款 */
export type EntryStatus = "pending" | "received" | "refunded"
export type Channel = "alipay" | "wechat" | "bank" | "platform" | "card"
export type IncomeCategory = "sales" | "subscription" | "sponsor" | "consulting" | "ads" | "other-income"
export type ExpenseCategory = "server" | "domain" | "ai" | "tools" | "design" | "marketing" | "other-expense"

export interface Milestone {
  id: string
  title: string
  due: DayKey
  doneOn: DayKey | null
}

export interface Project {
  id: string
  name: string
  color: LabelColor
  stage: ProjectStage
  goal: string
  startedOn: DayKey
  /** 每月净收入目标，没有就不显示进度 */
  monthlyTarget: number | null
  milestones: Milestone[]
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  seq: number
  title: string
  projectId: string | null
  status: TaskStatus
  priority: Priority
  /** 预估分钟数 */
  estimateMin: number
  /** 计划在哪天做 */
  plannedFor: DayKey | null
  /** 当天几点开始（时间线上的位置），HH:mm */
  startAt: string | null
  /** 截止日期 */
  dueOn: DayKey | null
  notes: string
  subtasks: Subtask[]
  createdAt: number
  completedAt: number | null
}

/** 一段实际投入的时间：计时器停下或手动补记时产生 */
export interface TimeEntry {
  id: string
  taskId: string | null
  projectId: string | null
  start: number
  end: number
}

export interface LedgerEntry {
  id: string
  kind: EntryKind
  /** 金额，正数；收入还是支出看 kind */
  amount: number
  projectId: string | null
  category: IncomeCategory | ExpenseCategory
  channel: Channel
  status: EntryStatus
  /** 发生日期；待到账的是记账日期 */
  date: DayKey
  /** 待到账时预计到账的日期 */
  expectedOn: DayKey | null
  note: string
  createdAt: number
}

export interface Routine {
  id: string
  title: string
  cadence: Cadence
  estimateMin: number
  projectId: string | null
  /** 完成过的日期 */
  doneOn: DayKey[]
  createdOn: DayKey
  archived: boolean
}

/** 每周回顾的三段笔记，week 是那周的周一 */
export interface WeekNote {
  week: DayKey
  wins: string
  improve: string
  next: string
}

export interface Profile {
  name: string
  /** 工作日、周末各能拿出多少分钟给副业和自己的事 */
  weekdayMin: number
  weekendMin: number
  /** 时间线从几点画到几点 */
  dayStartHour: number
  dayEndHour: number
}

export interface ActiveTimer {
  taskId: string | null
  projectId: string | null
  label: string
  startedAt: number
}

export interface WorkbenchData {
  profile: Profile
  projects: Project[]
  tasks: Task[]
  entries: TimeEntry[]
  ledger: LedgerEntry[]
  routines: Routine[]
  notes: WeekNote[]
  timer: ActiveTimer | null
}
