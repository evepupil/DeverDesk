/** ledger 的界面文字 */
export const ledger = {
  /** 工具条和分组头上的合计 */
  totals: {
    income: "收入",
    expense: "支出",
    net: "净",
    pendingOnTheWay: (amount: string) => `还有 ${amount} 在路上`,
  },
  /** 分组头和显示设置 */
  group: {
    label: "分组",
    month: "月份",
    project: "副业",
    category: "分类",
    pending: "待到账",
    personal: "个人事务",
    deletedProject: "已删除的副业",
  },
  /** 工具条和空状态 */
  page: {
    newEntry: "记一笔",
    export: "导出",
    tabAll: "全部",
    empty: "还没有收支记录",
    emptyFiltered: "没有符合筛选条件的记录",
    clearFilters: "清除筛选",
  },
  /** 导出 CSV */
  export: {
    /** 文件名前缀 */
    fileName: "收支",
    headers: ["日期", "类型", "金额", "状态", "副业", "分类", "渠道", "预计到账", "说明"],
    kindIncome: "收入",
    kindExpense: "支出",
    success: (count: number) => `已导出 ${count} 笔`,
  },
  /** 一行收支的操作菜单和提示 */
  row: {
    menu: (note: string) => `「${note}」的操作`,
    markReceived: "标记已到账",
    receivedToast: (amount: string) => `已到账 ${amount}`,
    markRefunded: "标记已退款",
    refundedToast: "已标记退款",
    markBackReceived: "改回已到账",
    backReceivedToast: "已改回已到账",
    deletedToast: "已删除一笔记录",
    undo: "撤销",
    overdue: (days: number) => `逾期 ${days} 天`,
    overdueCompact: (days: number) => `逾期${days}天`,
    due: (date: string) => `约定 ${date}`,
  },
}
