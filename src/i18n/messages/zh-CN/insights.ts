/** insights（概览）的界面文字 */
export const insights = {
  /** 筛选栏：时间范围分段选择的说明 */
  range: "时间范围",
  /** 显示设置：对比上一段时间 */
  compare: "对比上一段时间",
  /** 主图卡的四个指标名 */
  metrics: {
    net: "净收入",
    hours: "投入时间",
    rate: "时薪",
    done: "完成任务",
  },
  /** 完成任务的数量写法 */
  doneCount: (n: number) => `${n} 件`,
  /** 时间范围的分段选项 */
  ranges: {
    "4w": "4 周",
    "12w": "12 周",
    "12m": "12 个月",
  },
  /** 图表上方的一行说明 */
  rangeText: {
    "4w": "最近 4 周 · 按周",
    "12w": "最近 12 周 · 按周",
    "12m": "最近 12 个月 · 按月",
  },
  /** 主图卡的无障碍名 */
  metricsLabel: "核心指标",
  /** 图例：当前这段时间 */
  current: "本期",
  /** 图例：上一段同样长的时间 */
  previous: "上期",
  /** 副业卡 */
  projects: "副业",
  projectsEmpty: "这段时间没有记录",
  /** 没有归到任何副业的记录 */
  personal: "个人事务",
  /** 钱卡 */
  money: "钱",
  income: "收入来源",
  incomeEmpty: "没有收入",
  expense: "支出去向",
  expenseEmpty: "没有支出",
  /** 时间卡 */
  time: "时间",
  timeEmpty: "这段时间没有投入记录",
  /** 估时准确度 */
  accuracy: "估时准不准",
  exact: "刚好",
  /** 参数是正负号和百分点数，如（"+", 3）*/
  deviation: (sign: string, percent: number) => `实际${sign}${percent}%`,
  accuracyEmpty: "完成的任务里还没有投入记录",
  estimated: "预估",
  actual: "实际",
  /** 一周分布小图：七根柱子的单字下标，从周一到周日 */
  weekdayChars: ["一", "二", "三", "四", "五", "六", "日"],
  weekdaysHeading: "一周里哪天做得多",
  weekdaysAria: (hours: string[]) => `周一到周日投入：${hours.join("、")}`,
  /** 参数是星期几的叫法（如周一）和投入时长 */
  weekdayTitle: (weekday: string, hours: string) => `${weekday}：${hours}`,
  /** 本期结束 */
  ended: "本期结束",
  endedDone: "完成的任务",
  endedMilestones: "达成的里程碑",
  endedRefunds: "退款",
  moreItems: (n: number) => `另有 ${n} 条`,
  /** 动态 */
  activity: "动态",
  activityEmpty: "这段时间没有动态",
  eventDone: "完成任务",
  eventIncome: "收入到账",
  eventExpense: "支出",
  eventRefund: "退款",
  eventMilestone: "达成里程碑",
  /** 时薪指标后面的算法说明 */
  rateFormula: " · 净收入 ÷ 投入时间",
}
