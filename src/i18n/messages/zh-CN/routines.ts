/** routines 的界面文字 */
export const routines = {
  /** 页面右上角的新建按钮 */
  newRoutine: "新的例行事务",
  /** 看板列（routines-page.tsx） */
  groups: {
    day: "每天",
    week: "每周",
    month: "每月",
    archived: "已停用",
  },
  /** 筛选条上的进度（routines-page.tsx） */
  progress: {
    day: "今天",
    week: "本周",
    month: "本月",
  },
  /** 空态（routines-page.tsx） */
  empty: "还没有例行事务",
  emptyGroup: "没有例行事务",
  collapseColumn: "收起这一列",
  expandGroup: (group: string, count: number) => `展开「${group}」，${count} 项`,
  /** 例行卡片（routine-card.tsx） */
  card: {
    streak: (count: number, unit: string) => `连续 ${count} ${unit}`,
    noStreak: "还没连上",
    actions: (title: string) => `「${title}」的操作`,
    archive: "停用",
    restore: "恢复",
    archived: (title: string) => `已停用「${title}」`,
    periodDone: (period: string) => `${period}做过了`,
  },
  /** 连续几期的单位（routine-card.tsx） */
  streakUnit: {
    daily: "天",
    weekdays: "天",
    weekly: "周",
    monthly: "个月",
  },
  /** 完成率的时间跨度（routine-card.tsx） */
  rate: {
    weeks12: "近 12 周",
    months6: "近 6 个月",
    days30: "近 30 天",
  },
  /** 打卡格子（routine-card.tsx） */
  heat: {
    title: (when: string, state: string) => `${when}：${state}`,
    weekOf: (day: string) => `${day} 那周`,
    future: "还没到",
    notNeeded: "不用做",
    done: "做了",
    missed: "没做",
    summary: (due: number, done: number) => `最近 ${due} 期里做了 ${done} 期`,
  },
}
