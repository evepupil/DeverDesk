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
import { getSeedText } from "./seed-text"

type SeedText = ReturnType<typeof getSeedText>

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

function createProjects(text: ReturnType<typeof getSeedText>): ProjectSeed[] {
  return [
    {
      id: "p-templates",
      name: text.projects.templates.name,
      color: "indigo",
      stage: "running",
      goal: text.projects.templates.goal,
      startedDaysAgo: 240,
      monthlyTarget: 6000,
      weeklyHours: 5,
      titles: (rng) =>
        rng.pick([
          text.projects.templates.title.designHome(rng.pick(text.topics.templateKinds)),
          text.projects.templates.title.addDarkTheme(rng.pick(text.topics.templateKinds)),
          text.projects.templates.title.writeGuide(rng.pick(text.topics.templateKinds)),
          text.projects.templates.title.recordDemo(rng.pick(text.topics.templateKinds)),
          text.projects.templates.title.fixMobileOverflow(rng.pick(text.topics.templateKinds)),
          text.projects.templates.title.publish(rng.pick(text.topics.templateKinds)),
          text.projects.templates.title.buyerFeedback(rng.pick(text.topics.templateIssues)),
          text.projects.templates.title.productPage,
          text.projects.templates.title.screenshots,
        ]),
      milestones: [
        { title: text.projects.templates.milestones[0], offset: -200, done: true },
        { title: text.projects.templates.milestones[1], offset: -60, done: true },
        { title: text.projects.templates.milestones[2], offset: 10, done: false },
        { title: text.projects.templates.milestones[3], offset: 60, done: false },
      ],
    },
    {
      id: "p-relay",
      name: text.projects.relay.name,
      color: "blue",
      stage: "running",
      goal: text.projects.relay.goal,
      startedDaysAgo: 330,
      monthlyTarget: 4000,
      weeklyHours: 3.5,
      titles: (rng) =>
        rng.pick([
          text.projects.relay.title.checkTimeout(rng.pick(text.topics.relayModels)),
          text.projects.relay.title.rateLimits,
          text.projects.relay.title.supportTicket(rng.pick(text.topics.relayIssues)),
          text.projects.relay.title.upgradeGateway,
          text.projects.relay.title.onboardingGuide,
          text.projects.relay.title.balanceAlert,
          text.projects.relay.title.connectModel(rng.pick(text.topics.relayModels)),
        ]),
      milestones: [
        { title: text.projects.relay.milestones[0], offset: -120, done: true },
        { title: text.projects.relay.milestones[1], offset: -30, done: true },
        { title: text.projects.relay.milestones[2], offset: 14, done: false },
      ],
    },
    {
      id: "p-blog",
      name: text.projects.blog.name,
      color: "teal",
      stage: "running",
      goal: text.projects.blog.goal,
      startedDaysAgo: 420,
      monthlyTarget: 1500,
      weeklyHours: 4.5,
      titles: (rng) => {
        const topic = rng.pick(text.topics.blogTopics)
        return rng.pick([
          text.projects.blog.title.article(topic),
          text.projects.blog.title.illustrate(topic),
          text.projects.blog.title.proofread(topic),
          text.projects.blog.title.comments,
          text.projects.blog.title.readingNotes,
        ])
      },
      milestones: [
        { title: text.projects.blog.milestones[0], offset: -150, done: true },
        { title: text.projects.blog.milestones[1], offset: -40, done: true },
        { title: text.projects.blog.milestones[2], offset: 30, done: false },
      ],
    },
    {
      id: "p-consult",
      name: text.projects.consulting.name,
      color: "orange",
      stage: "running",
      goal: text.projects.consulting.goal,
      startedDaysAgo: 180,
      monthlyTarget: 2000,
      weeklyHours: 1.5,
      titles: (rng) => {
        const client = rng.pick(text.topics.clients)
        return rng.pick([
          text.projects.consulting.title.prepare(client),
          text.projects.consulting.title.session(rng.pick(text.topics.consultTopics)),
          text.projects.consulting.title.writeUp(client),
        ])
      },
      milestones: [
        { title: text.projects.consulting.milestones[0], offset: -170, done: true },
        { title: text.projects.consulting.milestones[1], offset: 7, done: false },
      ],
    },
    {
      id: "p-newsletter",
      name: text.projects.newsletter.name,
      color: "pink",
      stage: "building",
      goal: text.projects.newsletter.goal,
      startedDaysAgo: 95,
      monthlyTarget: null,
      weeklyHours: 2.5,
      titles: (rng) =>
        rng.pick([
          text.projects.newsletter.title.post(rng.pick(text.topics.postTopics)),
          text.projects.newsletter.title.schedule,
          text.projects.newsletter.title.pitchMeeting,
          text.projects.newsletter.title.messages,
          text.projects.newsletter.title.cover,
        ]),
      milestones: [
        { title: text.projects.newsletter.milestones[0], offset: -20, done: true },
        { title: text.projects.newsletter.milestones[1], offset: 90, done: false },
      ],
    },
    {
      id: "p-course",
      name: text.projects.course.name,
      color: "amber",
      stage: "idea",
      goal: text.projects.course.goal,
      startedDaysAgo: 6,
      monthlyTarget: null,
      weeklyHours: 0,
      titles: () => text.projects.course.title,
      milestones: [{ title: text.projects.course.milestones[0], offset: 21, done: false }],
    },
    {
      id: "p-plugin",
      name: text.projects.plugin.name,
      color: "gray",
      stage: "ended",
      goal: text.projects.plugin.goal,
      startedDaysAgo: 400,
      endedDaysAgo: 110,
      monthlyTarget: null,
      weeklyHours: 1.5,
      titles: (rng) => rng.pick(text.projects.plugin.titles),
      milestones: [
        { title: text.projects.plugin.milestones[0], offset: -330, done: true },
        { title: text.projects.plugin.milestones[1], offset: -110, done: true },
      ],
    },
  ]
}

const PERSONAL_TITLES = (rng: Rng, text: ReturnType<typeof getSeedText>) =>
  rng.pick([
    text.personalTasks.bills,
    text.personalTasks.callParents,
    text.personalTasks.readBook(rng.pick(text.topics.books)),
    text.personalTasks.diskCleanup,
    text.personalTasks.bikeRepair,
    text.personalTasks.photos,
  ])

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

function generateHistory(rng: Rng, today: DayKey, builder: Builder, projects: ProjectSeed[], text: SeedText) {
  const thisWeek = weekStart(today)
  for (let w = 52; w >= 0; w--) {
    const start = addDays(thisWeek, -7 * w)
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((day) => day < today)
    if (days.length === 0) continue

    const lanes: { projectId: string | null; hours: number; titles: (rng: Rng) => string; earliest: DayKey }[] = []
    for (const project of projects) {
      const began = addDays(today, -project.startedDaysAgo)
      const ended = project.endedDaysAgo !== undefined ? addDays(today, -project.endedDaysAgo) : null
      if (project.weeklyHours === 0 || began > days[days.length - 1] || (ended && ended < days[0])) continue
      const ramp = diffDays(days[0], began) < 28 ? 0.6 : 1
      lanes.push({ projectId: project.id, hours: project.weeklyHours * ramp, titles: project.titles, earliest: began })
    }
    lanes.push({ projectId: null, hours: 1.2, titles: (rng) => PERSONAL_TITLES(rng, text), earliest: addDays(today, -400) })

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
  subtasks?: readonly string[]
  notes?: string
}

function openTasks(today: DayKey, text: SeedText): OpenSeed[] {
  const weekend = isWeekend(today)
  const prevMonth = parseDay(addMonths(today, -1)).getMonth() + 1
  const seedText = text.openTasks
  return [
    {
      title: seedText.relayTimeout.title,
      projectId: "p-relay",
      status: "doing",
      estimate: weekend ? 60 : 45,
      priority: 4,
      planned: 0,
      startAt: weekend ? "10:00" : "19:30",
      logged: [{ dayOffset: -1, start: "21:10", minutes: 20 }],
      notes: seedText.relayTimeout.notes,
      subtasks: seedText.relayTimeout.subtasks,
    },
    {
      title: seedText.templateDemo.title,
      projectId: "p-templates",
      status: "doing",
      estimate: weekend ? 120 : 90,
      priority: 3,
      planned: 0,
      startAt: weekend ? "14:00" : "20:30",
      logged: [{ dayOffset: -1, start: "20:00", minutes: 50 }],
      subtasks: seedText.templateDemo.subtasks,
    },
    { title: seedText.blogOutline, projectId: "p-blog", status: "todo", estimate: weekend ? 90 : 45, priority: 2, planned: 1 },
    { title: seedText.newsletterReplies, projectId: "p-newsletter", status: "todo", estimate: 15, priority: 1, planned: 0 },
    ...(weekend
      ? [{ title: seedText.templateDemoVideo, projectId: "p-templates", status: "todo" as const, estimate: 60, priority: 2 as Priority, planned: 0 }]
      : []),
    { title: seedText.monthlyRelayBill(prevMonth), projectId: "p-relay", status: "todo", estimate: 45, priority: 3, planned: -1 },
    { title: seedText.consultingQuote, projectId: "p-consult", status: "todo", estimate: 30, priority: 2, planned: -2 },
    { title: seedText.publishWorkbenchTemplate, projectId: "p-templates", status: "todo", estimate: 60, priority: 3, planned: 1, due: 10 },
    { title: seedText.newsletterSchedule, projectId: "p-newsletter", status: "todo", estimate: 45, priority: 2, planned: 1 },
    { title: seedText.aiConsultingSession, projectId: "p-consult", status: "todo", estimate: 90, priority: 3, planned: 2, startAt: "14:00" },
    ...(weekend ? [] : [{ title: seedText.templateDemoVideo, projectId: "p-templates", status: "todo" as const, estimate: 60, priority: 2 as Priority, planned: 3 }]),
    { title: seedText.readingNotes, projectId: "p-blog", status: "todo", estimate: 30, priority: 1, planned: 4 },
    { title: seedText.relayLoadTest, projectId: "p-relay", status: "todo", estimate: 120, priority: 2 },
    { title: seedText.fixTemplateOverflow, projectId: "p-templates", status: "todo", estimate: 60, priority: 3, due: 3 },
    { title: seedText.exportTopups, projectId: "p-relay", status: "todo", estimate: 90, priority: 1 },
    { title: seedText.illustrateCloudflare, projectId: "p-blog", status: "todo", estimate: 30, priority: 1 },
    { title: seedText.internetRenewal, projectId: null, status: "todo", estimate: 15, priority: 2, due: 3 },
    { title: seedText.healthCheck, projectId: null, status: "todo", estimate: 15, priority: 3, due: -1 },
    { title: seedText.resume, projectId: null, status: "todo", estimate: 60, priority: 0 },
    { title: seedText.templateCoupon, projectId: "p-templates", status: "todo", estimate: 90, priority: 1 },
    { title: seedText.courseOutline, projectId: "p-course", status: "backlog", estimate: 120, priority: 2 },
    { title: seedText.courseRehearsal, projectId: "p-course", status: "backlog", estimate: 90, priority: 0 },
    { title: seedText.moveLogs, projectId: "p-relay", status: "backlog", estimate: 180, priority: 1 },
    { title: seedText.personalWorkbenchArticle, projectId: "p-blog", status: "backlog", estimate: 120, priority: 2 },
    { title: seedText.templateEnglishDocs, projectId: "p-templates", status: "backlog", estimate: 180, priority: 1 },
    { title: seedText.backupPlan, projectId: null, status: "backlog", estimate: 60, priority: 1 },
    { title: seedText.newsletterGiveaway, projectId: "p-newsletter", status: "backlog", estimate: 60, priority: 0 },
    { title: seedText.darkTemplate, projectId: "p-templates", status: "backlog", estimate: 240, priority: 1 },
    { title: seedText.consultingArticle, projectId: "p-consult", status: "backlog", estimate: 90, priority: 0 },
    { title: seedText.mobileWorkbench, projectId: null, status: "backlog", estimate: 120, priority: 0 },
    { title: seedText.pluginPaidPlan, projectId: "p-plugin", status: "dropped", estimate: 180, priority: 1 },
    { title: seedText.dailyShortVideo, projectId: "p-newsletter", status: "dropped", estimate: 30, priority: 0 },
  ]
}

function buildOpenTasks(rng: Rng, today: DayKey, builder: Builder, now: number, text: SeedText) {
  for (const seed of openTasks(today, text)) {
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
    title: text.completedGuide,
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

function generateLedger(rng: Rng, today: DayKey, text: SeedText): Omit<LedgerEntry, "id">[] {
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
    add("income", monday, amount, "p-templates", "sales", "platform", text.ledger.weeklyTemplateSales(Math.max(1, Math.round(amount / 129))))
  }
  add("income", today, round(420 + rng.next() * 300, 1), "p-templates", "sales", "platform", text.ledger.pendingTemplateSales, "pending", addDays(weekStart(today), 7))
  add("income", addDays(today, -41), 129, "p-templates", "sales", "platform", text.ledger.accidentalRefund, "refunded")

  // 接口中转：每周日汇总一次用户充值，上游账单下月初扣
  const relayStart = addDays(today, -330)
  const relayByMonth = new Map<string, number>()
  for (let sunday = addDays(weekStart(relayStart), 6); sunday <= today; sunday = addDays(sunday, 7)) {
    if (sunday < relayStart || sunday < horizon) continue
    const weeks = diffDays(sunday, relayStart) / 7
    const amount = round((450 + weeks * 30) * (0.8 + rng.next() * 0.4), 1)
    add("income", sunday, amount, "p-relay", "subscription", weeks % 2 < 1 ? "alipay" : "wechat", text.ledger.userTopUps(Math.max(3, Math.round(amount / 68))))
    const key = sunday.slice(0, 7)
    relayByMonth.set(key, (relayByMonth.get(key) ?? 0) + amount)
  }
  for (const [key, income] of relayByMonth) {
    const billDay = addDays(monthStart(`${key}-01`), 32)
    const bill = `${monthStart(billDay).slice(0, 8)}03`
    add("expense", bill, round(income * (0.46 + rng.next() * 0.06), 1), "p-relay", "ai", "card", text.ledger.upstreamModelBill(Number(key.slice(5))))
  }

  // 每月固定开销
  for (let month = horizon; month <= today; month = addMonths(month, 1)) {
    add("expense", addDays(month, 11), 168, "p-relay", "server", "alipay", text.ledger.serverMonthlyFee)
    if (month >= monthStart(templatesStart)) add("expense", month, 70, "p-templates", "tools", "card", text.ledger.designToolsSubscription)
    add("income", addDays(month, 4), round(60 + rng.next() * 160, 1), "p-blog", "ads", "platform", text.ledger.adNetworkMonthlyPayout)
    if (month >= monthStart(addDays(today, -95))) {
      add("income", addDays(month, 7), round(40 + rng.next() * 220, 1), "p-newsletter", "ads", "platform", text.ledger.newsletterAdRevenue)
      add("expense", addDays(month, 2), 30, "p-newsletter", "tools", "wechat", text.ledger.newsletterToolMembership)
    }
  }

  // 博客赞助：五到七周一次，最近一笔已经过了约定到账日
  for (let day = addDays(today, -330), i = 0; day <= addDays(today, -20); day = addDays(day, 35 + rng.int(0, 14)), i++) {
    if (day < horizon) continue
    add("income", day, round(1800 + rng.next() * 1400, 100), "p-blog", "sponsor", "bank", text.ledger.sponsorMention(text.topics.sponsors[i % text.topics.sponsors.length]))
  }
  add("income", addDays(today, -12), 2400, "p-blog", "sponsor", "bank", text.ledger.annualSponsorDeposit, "pending", addDays(today, -4))
  add("expense", addDays(today, -150), 79, "p-blog", "domain", "alipay", text.ledger.blogDomainRenewal)

  // 付费咨询：每月一到三次
  const consultStart = addDays(today, -180)
  for (let month = monthStart(consultStart); month <= today; month = addMonths(month, 1)) {
    const sessions = rng.int(1, 3)
    for (let i = 0; i < sessions; i++) {
      const day = addDays(month, rng.int(2, 26))
      if (day < consultStart || day > addDays(today, -3)) continue
      add("income", day, round(600 + rng.next() * 900, 100), "p-consult", "consulting", rng.chance(0.5) ? "wechat" : "bank", text.ledger.consultingSession(rng.pick(text.topics.consultTopics), rng.pick(text.topics.clients)))
    }
  }
  add("income", addDays(today, -2), 1200, "p-consult", "consulting", "bank", text.ledger.pendingDesignConsulting, "pending", addDays(today, 5))

  // 一次性支出
  add("expense", addDays(today, -125), 199, "p-templates", "design", "alipay", text.ledger.iconAssetLicense)
  add("expense", addDays(today, -150), 300, "p-templates", "marketing", "wechat", text.ledger.templatePromotion)
  add("expense", addDays(today, -58), 300, "p-templates", "marketing", "wechat", text.ledger.templatePromotion)
  add("expense", addDays(today, -200), 99, "p-plugin", "tools", "card", text.ledger.pluginDeveloperFee)

  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

function generateRoutines(rng: Rng, today: DayKey, text: SeedText): Routine[] {
  const since = addDays(today, -150)
  const seeds: { id: string; title: string; cadence: Routine["cadence"]; estimateMin: number; projectId: string | null; rate: number; streak: number; today?: boolean; createdOn?: DayKey }[] = [
    { id: "r-writing", title: text.routines.writing, cadence: "daily", estimateMin: 30, projectId: "p-blog", rate: 0.78, streak: 11 },
    { id: "r-support", title: text.routines.support, cadence: "daily", estimateMin: 15, projectId: "p-relay", rate: 0.86, streak: 6, today: true },
    { id: "r-exercise", title: text.routines.exercise, cadence: "weekdays", estimateMin: 40, projectId: null, rate: 0.62, streak: 2 },
    { id: "r-post", title: text.routines.newsletter, cadence: "weekly", estimateMin: 60, projectId: "p-newsletter", rate: 0.9, streak: 5, createdOn: addDays(today, -90) },
    { id: "r-review", title: text.routines.weeklyReview, cadence: "weekly", estimateMin: 30, projectId: null, rate: 0.85, streak: 3 },
    { id: "r-books", title: text.routines.monthlyReconcile, cadence: "monthly", estimateMin: 45, projectId: null, rate: 1, streak: 5 },
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

export function generateWorkbench(today: DayKey, now: number): WorkbenchData {
  const text = getSeedText()
  const projectSeeds = createProjects(text)
  const rng = createRng(20260929)
  const builder: Builder = { tasks: [], entries: [] }

  generateHistory(rng, today, builder, projectSeeds, text)
  buildOpenTasks(rng, today, builder, now, text)

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

  const ledger: LedgerEntry[] = generateLedger(rng, today, text).map((entry, i) => ({ ...entry, id: `L-${i + 1}` }))

  const projects: Project[] = projectSeeds.map((seed, p) => ({
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
  const notes: WeekNote[] = text.notes.map((note, i) => ({ ...note, week: addDays(thisWeek, -7 * (i + 1)) }))

  return {
    profile: { name: text.profile.me, weekdayMin: 240, weekendMin: 420, dayStartHour: 8, dayEndHour: 24 },
    projects,
    tasks,
    entries,
    ledger,
    routines: generateRoutines(rng, today, text),
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

/** 在线版首次打开时使用的空白工作台 */
export function blankWorkbench(): WorkbenchData {
  const text = getSeedText()
  return {
    profile: { name: text.profile.me, weekdayMin: 180, weekendMin: 360, dayStartHour: 8, dayEndHour: 24 },
    projects: [],
    tasks: [],
    entries: [],
    ledger: [],
    routines: [],
    notes: [],
    timer: null,
  }
}

