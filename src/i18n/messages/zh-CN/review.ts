/** review 的界面文字 */
export const review = {
  /** 页面标题：本周回顾 */
  title: (week: string) => `${week}回顾`,
  /** 副业已删除时的叫法（domain/review.ts 的 projectNameOf） */
  deletedProject: "已删除的副业",
  /** 筛选条上的合计：完成 5 件 / 投入 12.5h / 净收入 ¥100 */
  filter: {
    /** 数字在中间高亮，所以拆成前后两段；英文没有量词，后段为空 */
    doneBefore: "完成 ",
    doneAfter: " 件",
    invested: "投入",
    net: "净收入",
  },
  /** 自动小结（domain/review.ts 的 summarize）：整句写成函数，参数是数字和拼好的片段 */
  summary: {
    /** 对比上一期时对上周的叫法 */
    thanWeek: "上周",
    thanPartial: "上周同期",
    done: (done: number, comparison: string) => `完成 ${done} 件任务${comparison}。`,
    invested: (minutes: string, comparison: string, share: string) => `投入 ${minutes}${comparison}；${share}`,
    share: (project: string, percent: number) => `${project}占 ${percent}%。`,
    net: (net: string, income: string, expense: string) => `净收入 ${net}（收入 ${income}，支出 ${expense}）。`,
    accuracy: (direction: "same" | "over" | "under", percent: number) => {
      if (direction === "same") return "完成的任务实际用时和预估一致。"
      return `完成的任务实际用时比预估${direction === "over" ? "多" : "少"} ${percent}%。`
    },
    routines: (done: number, due: number) => `例行事务完成 ${done}/${due}。`,
    /** 和上一期的对比片段：件数带量词，时长直接接格式化好的时长 */
    compare: {
      tasks: {
        same: (than: string) => `，和${than}持平`,
        more: (diff: number, than: string) => `，比${than}多 ${diff} 件`,
        less: (diff: number, than: string) => `，比${than}少 ${diff} 件`,
      },
      minutes: {
        same: (than: string) => `，和${than}持平`,
        more: (amount: string, than: string) => `，比${than}多 ${amount}`,
        less: (amount: string, than: string) => `，比${than}少 ${amount}`,
      },
    },
  },
  /** 这周小结卡片 */
  digest: {
    heading: "这周小结",
    notStarted: "这一周还没开始",
  },
  /** 完成的 */
  done: {
    title: "完成的",
    empty: "这周还没有完成的任务",
    more: (n: number) => `另有 ${n} 件`,
  },
  /** 时间 */
  time: {
    title: "时间",
    perDay: "每天",
    perDayAside: "投入 / 可用",
    byProject: "花在哪",
  },
  /** 钱 */
  money: {
    title: "钱",
    income: "收入",
    expense: "支出",
    net: "净收入",
  },
  /** 往期 */
  past: {
    title: "往期",
    noted: "写了复盘",
    stats: (done: number, hours: string, amount: string) => `完成 ${done} · ${hours} · ${amount}`,
  },
  /** 三段复盘笔记 */
  notes: {
    title: "复盘",
    wins: { label: "做得好的", placeholder: "这周最满意的一件事" },
    improve: { label: "可以更好的", placeholder: "卡住、拖延或者估错的地方" },
    next: { label: "下周只做", placeholder: "下周最重要的一两件事" },
    saved: "已保存",
  },
}
