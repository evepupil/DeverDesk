/** tasks 的界面文字 */
export const tasks = {
  /** 页面右上角的新建按钮 */
  newTask: "新建任务",
  /** 筛选条右侧的任务总数 */
  count: (n: number) => `${n} 件`,
  /** 空态里的清除筛选 */
  clearFilters: "清除筛选",
  /** 页面上的范围标签 */
  scopes: {
    all: "全部",
    week: "本周",
    unplanned: "还没安排",
  },
  /** 布局切换（tasks-page.tsx） */
  layout: {
    label: "布局",
    board: "看板",
    list: "列表",
  },
  /** 「显示」设置（tasks-page.tsx） */
  display: {
    group: "分组",
    sort: "排序",
    sortPriority: "优先级",
    sortDue: "截止日期",
    sortCreated: "创建时间",
    sortTitle: "名称",
    showEnded: "显示已结束的分组",
    onCard: "卡片上显示",
    propertyId: "编号",
    propertyEstimate: "时长",
    propertyDue: "截止",
  },
  /** 看板和列表的分组（tasks-board.tsx、tasks-list.tsx） */
  board: {
    newInGroup: (group: string) => `在「${group}」新建`,
    collapseColumn: "收起这一列",
    emptyGroup: "没有任务",
    more: (n: number) => `显示更多（还有 ${n} 件）`,
    expandGroup: (group: string, count: number) => `展开「${group}」，${count} 件`,
  },
  /** 空态（tasks-page.tsx） */
  empty: {
    all: "还没有任务",
    scope: "这里没有任务",
    filtered: "没有符合筛选条件的任务",
  },
}
