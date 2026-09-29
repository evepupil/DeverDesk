import { createRng, type Rng } from "@/data/rng"
import {
  addDays,
  addMonths,
  dayStartMs,
  diffDays,
  isWeekend,
  monthStart,
  parseDay,
  weekStart,
} from "@/domain/calendar"
import type {
  Channel,
  DayKey,
  ExpenseCategory,
  IncomeCategory,
  LedgerEntry,
  Priority,
  Project,
  ProjectStage,
  Routine,
  Task,
  TaskStatus,
  TimeEntry,
  WeekNote,
  WorkbenchData,
} from "@/domain/types"
import type { LabelColor } from "@/domain/types"

/**
 * 个人工作台的样例数据：以「今天」为终点，往回模拟一年的副业记录。
 * 用固定种子生成，同一天打开看到的内容一致；日期都相对今天，任何时候打开都是新鲜的。
 */

const HOUR = 3_600_000
const MINUTE = 60_000

function at(day: DayKey, hour: number, minute = 0): number {
  return dayStartMs(day) + hour * HOUR + minute * MINUTE
}

interface ProjectSeed {
  id: string
  name: string
  color: LabelColor
  stage: ProjectStage
  goal: string
  /** 距今多少天开始 */
  startedDaysAgo: number
  endedDaysAgo?: number
  monthlyTarget: number | null
  /** 平均每周投入的小时数 */
  weeklyHours: number
  titles: (rng: Rng) => string
  milestones: { title: string; offset: number; done: boolean }[]
}

const TEMPLATE_KINDS = ["看板", "仪表盘", "落地页", "博客", "文档站", "电商后台", "作品集", "个人工作台"]
const TEMPLATE_ISSUES = ["表格列宽错位", "字体没加载", "日期选择器报错", "按钮对比度不够", "打包体积太大"]
const RELAY_MODELS = ["Claude", "GPT", "Gemini", "DeepSeek"]
const RELAY_ISSUES = ["余额显示不对", "流式输出中断", "密钥被误删", "发票抬头修改"]
const BLOG_TOPICS = ["Next.js 静态导出", "Tailwind 4 焦点样式", "Cloudflare 隧道", "设计提炼实验", "D1 数据迁移", "Go 时间精度", "流式输出断线"]
const CLIENTS = ["青柚科技", "北岸工作室", "拾光教育", "Moss 团队"]
const CONSULT_TOPICS = ["前端性能", "AI 接入方案", "设计系统落地", "团队代码评审"]
const POST_TOPICS = ["一个人做副业的时间表", "模板怎么定价", "接口中转的成本账", "我的工作台长什么样"]
const BOOKS = ["设计心理学", "人月神话", "原则", "长期主义"]
const SPONSORS = ["云栈", "极客圈", "码上学", "Linkly"]

const PROJECTS: ProjectSeed[] = [
  {
    id: "p-templates",
    name: "模板商城",
    color: "indigo",
    stage: "running",
    goal: "把设计好的界面模板做成能直接下载的商品，每月稳定卖出 40 份",
    startedDaysAgo: 240,
    monthlyTarget: 6000,
    weeklyHours: 5,
    titles: (rng) =>
      rng.pick([
        `设计${rng.pick(TEMPLATE_KINDS)}模板的首页`,
        `给${rng.pick(TEMPLATE_KINDS)}模板补暗色主题`,
        `写${rng.pick(TEMPLATE_KINDS)}模板的使用说明`,
        `录${rng.pick(TEMPLATE_KINDS)}模板的演示视频`,
        `修复${rng.pick(TEMPLATE_KINDS)}模板在手机上的溢出`,
        `上架${rng.pick(TEMPLATE_KINDS)}模板`,
        `处理买家反馈：${rng.pick(TEMPLATE_ISSUES)}`,
        "优化商品详情页",
        "整理模板截图",
      ]),
    milestones: [
      { title: "上线第一套模板", offset: -200, done: true },
      { title: "月销 30 份", offset: -60, done: true },
      { title: "上架个人工作台模板", offset: 10, done: false },
      { title: "月销 50 份", offset: 60, done: false },
    ],
  },
  {
    id: "p-relay",
    name: "接口中转",
    color: "blue",
    stage: "running",
    goal: "给小团队提供稳定的大模型接口中转，按用量收费",
    startedDaysAgo: 330,
    monthlyTarget: 4000,
    weeklyHours: 3.5,
    titles: (rng) =>
      rng.pick([
        `排查 ${rng.pick(RELAY_MODELS)} 接口超时`,
        "调整限流策略",
        `处理工单：${rng.pick(RELAY_ISSUES)}`,
        "升级网关版本",
        "给新用户发使用指南",
        "检查余额告警",
        `接入 ${rng.pick(RELAY_MODELS)} 新模型`,
      ]),
    milestones: [
      { title: "接入第二个上游", offset: -120, done: true },
      { title: "付费用户满 100", offset: -30, done: true },
      { title: "上线用量告警", offset: 14, done: false },
    ],
  },
  {
    id: "p-blog",
    name: "技术博客",
    color: "teal",
    stage: "running",
    goal: "每周一篇实践文章，带来赞助和咨询机会",
    startedDaysAgo: 420,
    monthlyTarget: 1500,
    weeklyHours: 4.5,
    titles: (rng) => {
      const topic = rng.pick(BLOG_TOPICS)
      return rng.pick([`写文章：${topic}`, `给「${topic}」配图`, `校对「${topic}」英文版`, "回复文章评论", "整理本周阅读笔记"])
    },
    milestones: [
      { title: "第一次赞助", offset: -150, done: true },
      { title: "连续写满 20 周", offset: -40, done: true },
      { title: "英文版上线", offset: 30, done: false },
    ],
  },
  {
    id: "p-consult",
    name: "付费咨询",
    color: "orange",
    stage: "running",
    goal: "每月接 2 到 3 次前端和 AI 工程咨询",
    startedDaysAgo: 180,
    monthlyTarget: 2000,
    weeklyHours: 1.5,
    titles: (rng) => {
      const client = rng.pick(CLIENTS)
      return rng.pick([`准备${client}咨询材料`, `咨询会：${rng.pick(CONSULT_TOPICS)}`, `整理${client}咨询纪要`])
    },
    milestones: [
      { title: "第一单咨询", offset: -170, done: true },
      { title: "做一份报价模板", offset: 7, done: false },
    ],
  },
  {
    id: "p-newsletter",
    name: "公众号",
    color: "pink",
    stage: "building",
    goal: "每周两篇推送，先把关注数做到 5000",
    startedDaysAgo: 95,
    monthlyTarget: null,
    weeklyHours: 2.5,
    titles: (rng) =>
      rng.pick([`写推文：${rng.pick(POST_TOPICS)}`, "排版本周推送", "开选题会", "回复后台留言", "做一张封面图"]),
    milestones: [
      { title: "关注满 1000", offset: -20, done: true },
      { title: "关注满 5000", offset: 90, done: false },
    ],
  },
  {
    id: "p-course",
    name: "前端小课",
    color: "amber",
    stage: "idea",
    goal: "把做工作台的方法整理成一门小课",
    startedDaysAgo: 6,
    monthlyTarget: null,
    weeklyHours: 0,
    titles: () => "整理课程素材",
    milestones: [{ title: "写完课程大纲", offset: 21, done: false }],
  },
  {
    id: "p-plugin",
    name: "划词插件",
    color: "gray",
    stage: "ended",
    goal: "浏览器划词翻译插件，用户太少，已下架",
    startedDaysAgo: 400,
    endedDaysAgo: 110,
    monthlyTarget: null,
    weeklyHours: 1.5,
    titles: (rng) => rng.pick(["修复划词弹窗位置", "回复商店评论", "适配新版浏览器"]),
    milestones: [
      { title: "上架商店", offset: -330, done: true },
      { title: "下架", offset: -110, done: true },
    ],
  },
]

const PERSONAL_TITLES = (rng: Rng) =>
  rng.pick(["整理家庭账单", "给爸妈打电话", `读完《${rng.pick(BOOKS)}》一章`, "清理电脑磁盘", "修自行车", "整理照片"])

const ESTIMATES = [
  [30, 22],
  [45, 18],
  [60, 26],
  [90, 16],
  [120, 12],
  [180, 6],
] as const

const PRIORITIES = [
  [0, 18],
  [1, 24],
  [2, 36],
  [3, 17],
  [4, 5],
] as const satisfies readonly (readonly [Priority, number])[]

interface Builder {
  tasks: Omit<Task, "id" | "seq">[]
  entries: Omit<TimeEntry, "id">[]
}

/** 一段专注：工作日多在晚上，周末在白天 */
function sessionStart(rng: Rng, day: DayKey): number {
  return isWeekend(day) ? at(day, 9 + rng.int(0, 7), rng.pick([0, 15, 30, 45])) : at(day, 19 + rng.int(0, 2), rng.pick([0, 15, 30, 45]))
}

function addDoneTask(
  rng: Rng,
  builder: Builder,
  opts: { title: string; projectId: string | null; day: DayKey; estimate: number; actual: number; earliest: DayKey }
) {
  const sessions = opts.actual > 80 && rng.chance(0.55) ? 2 : 1
  const secondDay = addDays(opts.day, -1) >= opts.earliest ? addDays(opts.day, -1) : opts.day
  let completedAt = 0
  const firstPart = sessions === 2 ? Math.round(opts.actual * (0.4 + rng.next() * 0.2)) : opts.actual
  const parts = sessions === 2 ? [{ day: secondDay, minutes: firstPart }, { day: opts.day, minutes: opts.actual - firstPart }] : [{ day: opts.day, minutes: opts.actual }]
  for (const part of parts) {
    const start = sessionStart(rng, part.day)
    const end = start + part.minutes * MINUTE
    builder.entries.push({ taskId: null, projectId: opts.projectId, start, end })
    completedAt = Math.max(completedAt, end)
  }
  const entryIndexes = parts.map((_, i) => builder.entries.length - parts.length + i)
  builder.tasks.push({
    title: opts.title,
    projectId: opts.projectId,
    status: "done",
    priority: rng.weighted(PRIORITIES),
    estimateMin: opts.estimate,
    plannedFor: opts.day,
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: completedAt - rng.int(1, 12) * 24 * HOUR,
    completedAt,
  })
  // 先记下时间段属于第几个任务，编号分好后再回填
  const taskIndex = builder.tasks.length - 1
  for (const index of entryIndexes) (builder.entries[index] as { taskIndex?: number }).taskIndex = taskIndex
}

function generateHistory(rng: Rng, today: DayKey, builder: Builder) {
  const thisWeek = weekStart(today)
  for (let w = 52; w >= 0; w--) {
    const start = addDays(thisWeek, -7 * w)
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((day) => day < today)
    if (days.length === 0) continue

    const lanes: { projectId: string | null; hours: number; titles: (rng: Rng) => string; earliest: DayKey }[] = []
    for (const project of PROJECTS) {
      const began = addDays(today, -project.startedDaysAgo)
      const ended = project.endedDaysAgo !== undefined ? addDays(today, -project.endedDaysAgo) : null
      if (project.weeklyHours === 0 || began > days[days.length - 1] || (ended && ended < days[0])) continue
      const ramp = diffDays(days[0], began) < 28 ? 0.6 : 1
      lanes.push({ projectId: project.id, hours: project.weeklyHours * ramp, titles: project.titles, earliest: began })
    }
    lanes.push({ projectId: null, hours: 1.2, titles: PERSONAL_TITLES, earliest: addDays(today, -400) })

    for (const lane of lanes) {
      let budget = lane.hours * 60 * (0.7 + rng.next() * 0.6) * (days.length / 7)
      while (budget > 20) {
        const estimate = rng.weighted(ESTIMATES)
        const factor = 0.65 + rng.next() * 0.9
        const actual = Math.max(15, Math.round((estimate * factor) / 5) * 5)
        const valid = days.filter((day) => day >= lane.earliest)
        if (valid.length === 0) break
        const day = rng.pick(valid)
        if (rng.chance(0.03)) {
          builder.tasks.push({
            title: lane.titles(rng),
            projectId: lane.projectId,
            status: "dropped",
            priority: rng.weighted(PRIORITIES),
            estimateMin: estimate,
            plannedFor: null,
            startAt: null,
            dueOn: null,
            notes: "",
            subtasks: [],
            createdAt: at(day, 21),
            completedAt: null,
          })
        } else {
          addDoneTask(rng, builder, { title: lane.titles(rng), projectId: lane.projectId, day, estimate, actual, earliest: lane.earliest })
        }
        budget -= actual
      }
    }
  }
}

interface OpenSeed {
  title: string
  projectId: string | null
  status: TaskStatus
  estimate: number
  priority: Priority
  planned?: number
  startAt?: string
  due?: number
  logged?: { dayOffset: number; start: string; minutes: number }[]
  subtasks?: string[]
  notes?: string
}

function openTasks(today: DayKey): OpenSeed[] {
  const weekend = isWeekend(today)
  const prevMonth = parseDay(addMonths(today, -1)).getMonth() + 1
  return [
    {
      title: "排查 Claude 接口超时",
      projectId: "p-relay",
      status: "doing",
      estimate: weekend ? 60 : 45,
      priority: 4,
      planned: 0,
      startAt: weekend ? "10:00" : "19:30",
      logged: [{ dayOffset: -1, start: "21:10", minutes: 20 }],
      notes: "高峰时段偶发 30 秒超时，先看网关日志里上游的响应时间。",
      subtasks: ["导出昨晚的网关日志", "对比两个上游的响应时间", "调大超时并观察一天"],
    },
    {
      title: "做个人工作台模板的在线演示",
      projectId: "p-templates",
      status: "doing",
      estimate: weekend ? 120 : 90,
      priority: 3,
      planned: 0,
      startAt: weekend ? "14:00" : "20:30",
      logged: [{ dayOffset: -1, start: "20:00", minutes: 50 }],
      subtasks: ["整理演示数据", "部署到静态托管", "录一段 30 秒的动图"],
    },
    { title: "列文章大纲：设计提炼实验", projectId: "p-blog", status: "todo", estimate: weekend ? 90 : 45, priority: 2, planned: 1 },
    { title: "回复后台留言", projectId: "p-newsletter", status: "todo", estimate: 15, priority: 1, planned: 0 },
    ...(weekend
      ? [{ title: "录个人工作台模板的演示视频", projectId: "p-templates", status: "todo" as const, estimate: 60, priority: 2 as Priority, planned: 0 }]
      : []),
    { title: `对账 ${prevMonth} 月上游账单`, projectId: "p-relay", status: "todo", estimate: 45, priority: 3, planned: -1 },
    { title: "给北岸工作室发报价", projectId: "p-consult", status: "todo", estimate: 30, priority: 2, planned: -2 },
    { title: "上架个人工作台模板", projectId: "p-templates", status: "todo", estimate: 60, priority: 3, planned: 1, due: 10 },
    { title: "排版本周推送", projectId: "p-newsletter", status: "todo", estimate: 45, priority: 2, planned: 1 },
    { title: "咨询会：AI 接入方案", projectId: "p-consult", status: "todo", estimate: 90, priority: 3, planned: 2, startAt: "14:00" },
    ...(weekend ? [] : [{ title: "录个人工作台模板的演示视频", projectId: "p-templates", status: "todo" as const, estimate: 60, priority: 2 as Priority, planned: 3 }]),
    { title: "整理本周阅读笔记", projectId: "p-blog", status: "todo", estimate: 30, priority: 1, planned: 4 },
    { title: "压测高峰时段并发", projectId: "p-relay", status: "todo", estimate: 120, priority: 2 },
    { title: "修复看板模板在手机上的溢出", projectId: "p-templates", status: "todo", estimate: 60, priority: 3, due: 3 },
    { title: "写充值记录导出", projectId: "p-relay", status: "todo", estimate: 90, priority: 1 },
    { title: "给「Cloudflare 隧道」配图", projectId: "p-blog", status: "todo", estimate: 30, priority: 1 },
    { title: "续费宽带", projectId: null, status: "todo", estimate: 15, priority: 2, due: 3 },
    { title: "预约体检", projectId: null, status: "todo", estimate: 15, priority: 3, due: -1 },
    { title: "更新简历", projectId: null, status: "todo", estimate: 60, priority: 0 },
    { title: "给模板商城加优惠码", projectId: "p-templates", status: "todo", estimate: 90, priority: 1 },
    { title: "写课程大纲", projectId: "p-course", status: "backlog", estimate: 120, priority: 2 },
    { title: "小课试讲录音", projectId: "p-course", status: "backlog", estimate: 90, priority: 0 },
    { title: "迁移日志到对象存储", projectId: "p-relay", status: "backlog", estimate: 180, priority: 1 },
    { title: "写文章：个人工作台", projectId: "p-blog", status: "backlog", estimate: 120, priority: 2 },
    { title: "给模板加英文文档", projectId: "p-templates", status: "backlog", estimate: 180, priority: 1 },
    { title: "研究数据库的备份方案", projectId: null, status: "backlog", estimate: 60, priority: 1 },
    { title: "公众号做一次抽奖", projectId: "p-newsletter", status: "backlog", estimate: 60, priority: 0 },
    { title: "做一版深色主题的模板", projectId: "p-templates", status: "backlog", estimate: 240, priority: 1 },
    { title: "把咨询纪要整理成文章", projectId: "p-consult", status: "backlog", estimate: 90, priority: 0 },
    {
      title: "试试把工作台做成手机上的轻量版，只保留今天的清单、快速记一笔收入和加一条任务这三件事",
      projectId: null,
      status: "backlog",
      estimate: 120,
      priority: 0,
    },
    { title: "给插件做付费版", projectId: "p-plugin", status: "dropped", estimate: 180, priority: 1 },
    { title: "每天发一条短视频", projectId: "p-newsletter", status: "dropped", estimate: 30, priority: 0 },
  ]
}

function buildOpenTasks(rng: Rng, today: DayKey, builder: Builder, now: number) {
  for (const seed of openTasks(today)) {
    const planned = seed.planned !== undefined ? addDays(today, seed.planned) : null
    const createdAt = now - rng.int(2, 20) * 24 * HOUR
    builder.tasks.push({
      title: seed.title,
      projectId: seed.projectId,
      status: seed.status,
      priority: seed.priority,
      estimateMin: seed.estimate,
      plannedFor: planned,
      startAt: planned ? (seed.startAt ?? null) : null,
      dueOn: seed.due !== undefined ? addDays(today, seed.due) : null,
      notes: seed.notes ?? "",
      subtasks: (seed.subtasks ?? []).map((title, i) => ({ id: `s-${builder.tasks.length}-${i}`, title, done: i === 0 && seed.status === "doing" })),
      createdAt,
      completedAt: null,
    })
    const taskIndex = builder.tasks.length - 1
    for (const log of seed.logged ?? []) {
      const [h, m] = log.start.split(":").map(Number)
      const start = at(addDays(today, log.dayOffset), h, m)
      builder.entries.push({ taskId: null, projectId: seed.projectId, start, end: start + log.minutes * MINUTE })
      ;(builder.entries[builder.entries.length - 1] as { taskIndex?: number }).taskIndex = taskIndex
    }
  }

  // 今天中午已经做完的一件
  const doneStart = at(today, isWeekend(today) ? 9 : 12, 10)
  builder.entries.push({ taskId: null, projectId: "p-relay", start: doneStart, end: doneStart + 30 * MINUTE })
  ;(builder.entries[builder.entries.length - 1] as { taskIndex?: number }).taskIndex = builder.tasks.length
  builder.tasks.push({
    title: "给新用户发使用指南",
    projectId: "p-relay",
    status: "done",
    priority: 2,
    estimateMin: 30,
    plannedFor: today,
    startAt: isWeekend(today) ? "09:10" : "12:10",
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: now - 26 * HOUR,
    completedAt: doneStart + 30 * MINUTE,
  })
}

function generateLedger(rng: Rng, today: DayKey): Omit<LedgerEntry, "id">[] {
  const rows: Omit<LedgerEntry, "id">[] = []
  const add = (
    kind: "income" | "expense",
    date: DayKey,
    amount: number,
    projectId: string | null,
    category: IncomeCategory | ExpenseCategory,
    channel: Channel,
    note: string,
    status: LedgerEntry["status"] = "received",
    expectedOn: DayKey | null = null
  ) => {
    if (date > today) return
    rows.push({ kind, date, amount, projectId, category, channel, status, expectedOn, note, createdAt: 0 })
  }
  const round = (value: number, step: number) => Math.max(step, Math.round(value / step) * step)
  const horizon = monthStart(addMonths(today, -11))

  // 模板商城：每周一平台结算上周的销售
  const templatesStart = addDays(today, -240)
  for (let monday = weekStart(templatesStart); monday <= today; monday = addDays(monday, 7)) {
    if (monday <= templatesStart || monday < horizon) continue
    const weeks = diffDays(monday, templatesStart) / 7
    const amount = round((180 + weeks * 38) * (0.75 + rng.next() * 0.5), 1)
    add("income", monday, amount, "p-templates", "sales", "platform", `平台周结算 · 售出 ${Math.max(1, Math.round(amount / 129))} 份`)
  }
  add("income", today, round(420 + rng.next() * 300, 1), "p-templates", "sales", "platform", "本周销售 · 待平台结算", "pending", addDays(weekStart(today), 7))
  add("income", addDays(today, -41), 129, "p-templates", "sales", "platform", "买家误购退款 · 1 份", "refunded")

  // 接口中转：每周日汇总一次用户充值，上游账单下月初扣
  const relayStart = addDays(today, -330)
  const relayByMonth = new Map<string, number>()
  for (let sunday = addDays(weekStart(relayStart), 6); sunday <= today; sunday = addDays(sunday, 7)) {
    if (sunday < relayStart || sunday < horizon) continue
    const weeks = diffDays(sunday, relayStart) / 7
    const amount = round((450 + weeks * 30) * (0.8 + rng.next() * 0.4), 1)
    add("income", sunday, amount, "p-relay", "subscription", weeks % 2 < 1 ? "alipay" : "wechat", `用户充值 · ${Math.max(3, Math.round(amount / 68))} 笔`)
    const key = sunday.slice(0, 7)
    relayByMonth.set(key, (relayByMonth.get(key) ?? 0) + amount)
  }
  for (const [key, income] of relayByMonth) {
    const billDay = addDays(monthStart(`${key}-01`), 32)
    const bill = `${monthStart(billDay).slice(0, 8)}03`
    add("expense", bill, round(income * (0.46 + rng.next() * 0.06), 1), "p-relay", "ai", "card", `上游模型账单 · ${Number(key.slice(5))} 月`)
  }

  // 每月固定开销
  for (let month = horizon; month <= today; month = addMonths(month, 1)) {
    add("expense", addDays(month, 11), 168, "p-relay", "server", "alipay", "云服务器月费")
    if (month >= monthStart(templatesStart)) add("expense", month, 70, "p-templates", "tools", "card", "设计工具订阅")
    add("income", addDays(month, 4), round(60 + rng.next() * 160, 1), "p-blog", "ads", "platform", "广告联盟月结")
    if (month >= monthStart(addDays(today, -95))) {
      add("income", addDays(month, 7), round(40 + rng.next() * 220, 1), "p-newsletter", "ads", "platform", "流量主收益")
      add("expense", addDays(month, 2), 30, "p-newsletter", "tools", "wechat", "排版工具会员")
    }
  }

  // 博客赞助：五到七周一次，最近一笔已经过了约定到账日
  for (let day = addDays(today, -330), i = 0; day <= addDays(today, -20); day = addDays(day, 35 + rng.int(0, 14)), i++) {
    if (day < horizon) continue
    add("income", day, round(1800 + rng.next() * 1400, 100), "p-blog", "sponsor", "bank", `${SPONSORS[i % SPONSORS.length]} 赞助 · 文末推荐`)
  }
  add("income", addDays(today, -12), 2400, "p-blog", "sponsor", "bank", "云栈 赞助 · 年度合作首付", "pending", addDays(today, -4))
  add("expense", addDays(today, -150), 79, "p-blog", "domain", "alipay", "博客域名续费")

  // 付费咨询：每月一到三次
  const consultStart = addDays(today, -180)
  for (let month = monthStart(consultStart); month <= today; month = addMonths(month, 1)) {
    const sessions = rng.int(1, 3)
    for (let i = 0; i < sessions; i++) {
      const day = addDays(month, rng.int(2, 26))
      if (day < consultStart || day > addDays(today, -3)) continue
      add("income", day, round(600 + rng.next() * 900, 100), "p-consult", "consulting", rng.chance(0.5) ? "wechat" : "bank", `咨询：${rng.pick(CONSULT_TOPICS)} · ${rng.pick(CLIENTS)}`)
    }
  }
  add("income", addDays(today, -2), 1200, "p-consult", "consulting", "bank", "咨询：设计系统落地 · 拾光教育", "pending", addDays(today, 5))

  // 一次性支出
  add("expense", addDays(today, -125), 199, "p-templates", "design", "alipay", "图标素材授权")
  add("expense", addDays(today, -150), 300, "p-templates", "marketing", "wechat", "模板推广投放")
  add("expense", addDays(today, -58), 300, "p-templates", "marketing", "wechat", "模板推广投放")
  add("expense", addDays(today, -200), 99, "p-plugin", "tools", "card", "插件商店开发者年费")

  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

function generateRoutines(rng: Rng, today: DayKey): Routine[] {
  const since = addDays(today, -150)
  const seeds: { id: string; title: string; cadence: Routine["cadence"]; estimateMin: number; projectId: string | null; rate: number; streak: number; today?: boolean; createdOn?: DayKey }[] = [
    { id: "r-writing", title: "晨间写作 30 分钟", cadence: "daily", estimateMin: 30, projectId: "p-blog", rate: 0.78, streak: 11 },
    { id: "r-support", title: "回复用户消息", cadence: "daily", estimateMin: 15, projectId: "p-relay", rate: 0.86, streak: 6, today: true },
    { id: "r-exercise", title: "运动 40 分钟", cadence: "weekdays", estimateMin: 40, projectId: null, rate: 0.62, streak: 2 },
    { id: "r-post", title: "发一篇公众号", cadence: "weekly", estimateMin: 60, projectId: "p-newsletter", rate: 0.9, streak: 5, createdOn: addDays(today, -90) },
    { id: "r-review", title: "写周回顾", cadence: "weekly", estimateMin: 30, projectId: null, rate: 0.85, streak: 3 },
    { id: "r-books", title: "月度对账", cadence: "monthly", estimateMin: 45, projectId: null, rate: 1, streak: 5 },
  ]

  return seeds.map((seed) => {
    const createdOn = seed.createdOn ?? since
    const doneOn = new Set<DayKey>()
    if (seed.cadence === "weekly") {
      for (let week = weekStart(createdOn); week < weekStart(today); week = addDays(week, 7)) {
        const recent = diffDays(weekStart(today), week) <= seed.streak * 7
        if (recent || rng.chance(seed.rate)) doneOn.add(addDays(week, rng.int(3, 6)))
      }
    } else if (seed.cadence === "monthly") {
      for (let month = monthStart(createdOn); month <= today; month = addMonths(month, 1)) {
        const day = addDays(month, 2)
        if (day <= today && (day < monthStart(today) || rng.chance(0.7))) doneOn.add(day)
      }
    } else {
      for (let day = createdOn; day < today; day = addDays(day, 1)) {
        if (seed.cadence === "weekdays" && isWeekend(day)) continue
        const recent = diffDays(today, day) <= seed.streak
        if (recent || rng.chance(isWeekend(day) ? seed.rate - 0.15 : seed.rate)) doneOn.add(day)
      }
      // 连续记录的前一天断开，让连续天数正好等于设定值
      let gap = addDays(today, -(seed.streak + 1))
      while (seed.cadence === "weekdays" && isWeekend(gap)) gap = addDays(gap, -1)
      doneOn.delete(gap)
      if (seed.today) doneOn.add(today)
    }
    return {
      id: seed.id,
      title: seed.title,
      cadence: seed.cadence,
      estimateMin: seed.estimateMin,
      projectId: seed.projectId,
      doneOn: [...doneOn].sort(),
      createdOn,
      archived: false,
    }
  })
}

const NOTES: Omit<WeekNote, "week">[] = [
  { wins: "上游超时的问题定位到了网关的连接池", improve: "同时开了三件新事，哪件都没收尾", next: "进行中的事最多两件" },
  { wins: "连续三周按时发了公众号", improve: "运动断了四天", next: "运动挪到午饭后" },
  { wins: "工作台模板的首页定稿", improve: "周末被临时的事打断两次", next: "周末上午只做一件大事" },
  { wins: "博客赞助谈下来了", improve: "估时普遍偏少，大概少两成", next: "新任务的预估先乘 1.2" },
  { wins: "模板一周卖出 11 份", improve: "咨询报价拖了三天才回", next: "报价做成模板，当天回复" },
  { wins: "接口中转的付费用户过了 100", improve: "晚上开工太晚，常拖到 23 点以后", next: "把对账挪到周三晚上" },
]

export function generateWorkbench(today: DayKey, now: number): WorkbenchData {
  const rng = createRng(20260929)
  const builder: Builder = { tasks: [], entries: [] }

  generateHistory(rng, today, builder)
  buildOpenTasks(rng, today, builder, now)

  // 按创建时间编号：越早创建编号越小
  const order = builder.tasks.map((task, index) => ({ task, index })).sort((a, b) => a.task.createdAt - b.task.createdAt)
  const idOf = new Map<number, string>()
  const tasks: Task[] = order.map(({ task, index }, i) => {
    const id = `T-${101 + i}`
    idOf.set(index, id)
    return { ...task, id, seq: 101 + i }
  })
  tasks.sort((a, b) => a.seq - b.seq)

  const entries: TimeEntry[] = builder.entries
    .map((entry, i) => {
      const taskIndex = (entry as { taskIndex?: number }).taskIndex
      return {
        id: `E-${i + 1}`,
        taskId: taskIndex !== undefined ? (idOf.get(taskIndex) ?? null) : null,
        projectId: entry.projectId,
        start: entry.start,
        end: entry.end,
      }
    })
    .sort((a, b) => a.start - b.start)

  const ledger: LedgerEntry[] = generateLedger(rng, today).map((entry, i) => ({ ...entry, id: `L-${i + 1}` }))

  const projects: Project[] = PROJECTS.map((seed, p) => ({
    id: seed.id,
    name: seed.name,
    color: seed.color,
    stage: seed.stage,
    goal: seed.goal,
    startedOn: addDays(today, -seed.startedDaysAgo),
    monthlyTarget: seed.monthlyTarget,
    milestones: seed.milestones.map((milestone, i) => ({
      id: `M-${p + 1}${i + 1}`,
      title: milestone.title,
      due: addDays(today, milestone.offset),
      doneOn: milestone.done ? addDays(today, milestone.offset) : null,
    })),
  }))

  const thisWeek = weekStart(today)
  const notes: WeekNote[] = NOTES.map((note, i) => ({ ...note, week: addDays(thisWeek, -7 * (i + 1)) }))

  return {
    profile: { name: "我", weekdayMin: 240, weekendMin: 420, dayStartHour: 8, dayEndHour: 24 },
    projects,
    tasks,
    entries,
    ledger,
    routines: generateRoutines(rng, today),
    notes,
    timer: null,
  }
}

/** 从零开始用：保留副业清单和作息设置，清空记录 */
export function emptyWorkbench(template: WorkbenchData): WorkbenchData {
  return {
    ...template,
    projects: template.projects
      .filter((project) => project.stage !== "ended")
      .map((project) => ({ ...project, milestones: [] })),
    tasks: [],
    entries: [],
    ledger: [],
    routines: template.routines.map((routine) => ({ ...routine, doneOn: [] })),
    notes: [],
    timer: null,
  }
}

