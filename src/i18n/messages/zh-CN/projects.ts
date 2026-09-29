/** projects 的界面文字 */
export const projects = {
  /** 筛选条上的本月小结 */
  filter: {
    net: "本月净收入",
    invested: "投入",
    hourly: "时薪",
  },
  /** 副业看板 */
  board: {
    newProject: "新的副业",
    empty: "还没有副业",
    monthNet: (amount: string) => `本月 ${amount}`,
    collapseColumn: "收起这一列",
    columnEmpty: "没有副业",
    expandColumn: (stage: string, count: number) => `展开「${stage}」，${count} 个副业`,
  },
  /** 副业卡片 */
  card: {
    targetTitle: (amount: string) => `本月目标 ${amount}`,
    targetProgress: (percent: number) => `目标 ${percent}%`,
    openTasks: (count: number) => `${count} 件待办`,
    overdue: (days: number) => `已过 ${days} 天`,
    inDays: (days: number) => `${days} 天后`,
  },
  /** 副业详情侧栏 */
  sheet: {
    title: "副业详情",
    notFound: "没有找到这个副业",
    started: (date: string) => `${date}开始`,
    lastActive: (date: string) => `最近活动 ${date}`,
    stage: "阶段",
    monthlyTarget: "月目标",
    thisMonth: "本月",
    net: "净收入",
    invested: "投入",
    hourly: "时薪",
    totalNet: "累计净收入",
    weeks: "最近 12 周净收入",
    weekTitle: (week: string, net: string, invested: string) => `${week} 那周：净收入 ${net}，投入 ${invested}`,
    milestones: "里程碑",
    /** 校验提示里对里程碑的称呼 */
    milestoneLabel: "里程碑",
    milestoneNew: "新里程碑",
    milestoneDue: "目标日期",
    milestonePlaceholder: "添加里程碑，回车确认",
    milestoneDone: (date: string) => `${date}达成`,
    tasks: "待办",
    allTasks: (count: number) => `全部 ${count} 件`,
    addTask: (name: string) => `给「${name}」加一件事`,
    all: "全部",
    recent: "最近收支",
    recentEmpty: "还没有收支记录",
  },
}
