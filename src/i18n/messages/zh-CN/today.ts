/** today 的界面文字 */
export const today = {
  undo: "撤销",
  /** 顶栏和页面动作 */
  page: {
    title: "今天",
    addEntry: "记一笔",
    newTask: "新建任务",
    autoSchedule: "自动排进时间线",
    autoScheduleShort: "自动排",
  },
  /** 容量条按钮 */
  load: {
    aria: "调整每天的可用时间",
    tasks: "任务",
    routines: "例行",
  },
  /** 自动排进时间线的结果提示 */
  arrange: {
    noRoom: "今天剩下的时间放不下了",
    noRoomHint: "挪一些到明天，或者调整可用时间",
    done: (n: number) => `排好了 ${n} 件`,
    leftover: (n: number) => `，还有 ${n} 件放不下`,
  },
  /** 时间线一列 */
  timeline: {
    title: "时间线",
    unplaced: (n: number) => `${n} 件还没排时间`,
    blockAria: (title: string, range: string) => `${title}，${range}。上下方向键挪动，按住 Shift 调整时长`,
    empty: "拖任务到这里，或点空白处安排时间",
    slotStart: (time: string) => `${time} 开始`,
  },
  /** 之前的还没做完，可以一键挪到今天 */
  rollover: {
    moved: (n: number) => `已把 ${n} 件挪到今天`,
    count: (n: number) => `${n} 件之前计划的还没做完`,
    move: "挪到今天",
    late: (n: number) => `延期 ${n} 天`,
    more: (n: number) => `还有 ${n} 件`,
  },
  /** 今天的计划一列 */
  plan: {
    title: "今天的计划",
    newTask: "新建今天的任务",
    empty: "今天还没有安排",
    allDone: "今天的计划都做完了",
    placeholder: "加到今天，例如：回复留言 15m #公众号",
    done: "今天做完的",
  },
  /** 可以加进今天一列 */
  suggestions: {
    title: "可以加进今天",
    add: (title: string) => `加进今天：${title}`,
    added: "已加进今天",
  },
  /** 连续计数的单位 */
  streakUnit: { daily: "天", weekdays: "天", weekly: "周", monthly: "个月" },
  /** 今天侧栏的例行卡 */
  routines: {
    title: "例行",
    new: "新的例行事务",
    empty: "今天没有例行事务",
    streak: (n: number, unit: string) => `连续 ${n} ${unit}`,
  },
  /** 今天侧栏的收支卡 */
  money: {
    title: "收支",
    netThisMonth: "本月净收入",
    meterAria: "本月净收入占月目标",
    target: (amount: string) => `目标 ${amount}`,
    pending: (n: number) => `待到账 ${n} 笔`,
  },
  /** 今天侧栏的投入卡 */
  focus: {
    title: "投入",
    empty: "今天还没有投入记录",
  },
}
