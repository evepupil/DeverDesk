/** common 的界面文字：共用部件里的可见文字、提示和无障碍说明 */
export const common = {
  /** 没有归到任何副业的记录 */
  personal: "个人事务",
  /** 删除后反悔的入口 */
  undo: "撤销",
  /** 任务正在计时的小标记 */
  running: "计时中",
  /** 容量条（capacity-bar.tsx） */
  capacityBar: {
    label: "当天已排时长",
    over: (minutes: string) => `超出 ${minutes}`,
  },
  /** 各页共用的筛选字段（filter-fields.tsx） */
  fields: {
    status: "状态",
    project: "副业",
    priority: "优先级",
    plan: "安排",
    planOptions: {
      today: "今天",
      week: "本周",
      unplanned: "还没安排",
      overdue: "逾期和延期",
    },
    kind: "收支",
    income: "收入",
    expense: "支出",
    channel: "渠道",
    category: "分类",
    entryStatus: "到账",
  },
  /** 快速添加（quick-add.tsx） */
  quickAdd: {
    placeholder: "添加任务，例如：写周报 30m #技术博客 明天",
    label: "快速添加任务",
    enterHint: "回车添加",
    missingTitle: "只识别出了时长、副业或日期，还缺任务名",
    added: (code: string) => `已添加 ${code}`,
  },
  /** 任务小部件（task-bits.tsx） */
  taskBits: {
    complete: (title: string) => `完成「${title}」`,
    reopen: (title: string) => `把「${title}」改回待办`,
    late: (days: number) => `延期 ${days} 天`,
    overdue: (days: number) => `逾期 ${days} 天`,
    dueToday: "今天截止",
    dueBy: (day: string) => `${day}截止`,
    startAria: (title: string) => `开始计时：${title}`,
    stopAria: (title: string) => `停止计时：${title}`,
  },
  /** 「更多」菜单（task-menu.tsx） */
  taskMenu: {
    actions: (title: string) => `「${title}」的操作`,
    schedule: "安排到",
    nextMonday: (day: string) => `下周一 ${day}`,
    current: "当前",
    unschedule: "不安排",
    deleted: (code: string) => `已删除 ${code}`,
  },
  /** 任务详情侧栏（task-sheet.tsx） */
  taskSheet: {
    title: "任务详情",
    deleted: "这个任务已经删除",
    createdAt: (day: string) => `${day}创建`,
    status: "状态",
    project: "副业",
    priority: "优先级",
    plan: "计划",
    startAt: "开始时间",
    estimate: "预估",
    due: "截止",
    logged: "已投入",
    log: "补记",
    loggedToast: (minutes: string) => `已补记 ${minutes}`,
    notes: "备注",
    notesPlaceholder: "写点背景、链接或下一步",
    subtasks: "子任务",
    deleteSubtask: (title: string) => `删除子任务：${title}`,
    addSubtask: "添加子任务",
    addSubtaskPlaceholder: "添加子任务，回车确认",
    timeEntries: "投入记录",
    segments: (count: number) => `${count} 段`,
    emptyEntries: "还没有记录，开始计时或补记一段",
    timing: "正在计时",
    startedAt: (time: string) => `${time} 开始`,
  },
  /** 周切换（week-nav.tsx） */
  weekNav: {
    current: "本周",
    last: "上周",
    next: "下周",
    nth: (week: number) => `第 ${week} 周`,
    prev: "上一周",
    nextLabel: "下一周",
  },
  /** 开始 / 停止计时（task-bits、task-menu、task-sheet 共用） */
  timer: {
    start: "开始计时",
    stop: "停止计时",
  },
}
