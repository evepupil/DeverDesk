/** week 的界面文字 */
export const week = {
  /** 筛选栏左边的本周完成情况 */
  progress: (done: number, total: number) => `完成 ${done}/${total} 件`,
  /** 一周没有以后的日子时，左边补充的实际投入 */
  loggedTotal: (minutes: string) => `投入 ${minutes}`,
  /** 显示设置里的一项 */
  showDone: "显示做完的任务",
  /** 把过去几天没做完的挪到今天 */
  movedToToday: (n: number) => `已把 ${n} 件挪到今天`,
  /** 那天标签：标题行里「今天」两字，以及过去几天实际投入的提示 */
  loggedDay: (minutes: string) => `投入 ${minutes}`,
  /** 过去几天没做完的任务一键挪到今天 */
  moveUnfinished: (n: number) => `${n} 件没做完，挪到今天`,
  /** 在某一天新建任务的按钮 */
  newTaskOn: (day: string) => `在${day}新建任务`,
  /** 一天里的空状态 */
  dayAllDone: "都做完了",
  dayEmpty: "没有安排",
  /** 右侧一列 */
  earlier: "之前没做完",
  unplannedTitle: "还没安排",
  allPlanned: "所有任务都排上日子了",
  /** 分页加载 */
  showMore: (n: number) => `显示更多（还有 ${n} 件）`,
}
