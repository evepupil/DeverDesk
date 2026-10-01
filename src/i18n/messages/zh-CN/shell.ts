/** shell 的界面文字 */
export const shell = {
  /** 工作台外框（workbench-shell.tsx） */
  workbench: {
    /** 左上角的归属 */
    workspace: "我的工作台",
    /** 窗口栏居中搜索框的提示 */
    search: "搜索任务、副业、收支",
    /** 网络断开时退出登录的提醒 */
    offlineSignOut: "连不上服务器，联网后再退出",
    exportBackup: "导出备份",
    importBackup: "导入备份",
    tokens: "连接 AI",
    signOut: "退出登录",
    signOutTitle: "退出登录？",
    /** 退出登录前还有没传到云端的改动 */
    signOutPending: (count: number) => `还有 ${count} 条改动没传到云端，退出后会丢掉。`,
    signOutAnyway: "仍然退出",
    /** 快捷键帮助里的「前往今天」这类 */
    goTo: (page: string) => `前往${page}`,
  },
  /** 头像菜单、品牌菜单和快捷键共用的几项 */
  menu: {
    newTask: "新建任务",
    logEntry: "记一笔",
    shortcuts: "键盘快捷键",
    availableTime: "可用时间",
  },
  /** 工作台侧栏（workbench-sidebar.tsx） */
  sidebar: {
    mainNav: "主导航",
    projects: "副业",
    newProject: "新的副业",
    views: "视图",
    aboutLocal: "关于本地版",
    startFresh: "清空样例，开始自己用",
    startFreshTitle: "清空样例，开始自己用？",
    startFreshDescription: "任务、投入记录、收支和回顾会清空；副业清单、例行事务和可用时间会保留，方便直接改成你自己的。",
    startFreshAction: "清空",
    startedFresh: "已清空，从今天开始记",
    resetSample: "换回样例数据",
    resetSampleTitle: "换回样例数据？",
    resetSampleDescription: "你自己记的内容会被样例数据替换，不能恢复。",
    resetSampleAction: "换回",
    resetSampleDone: "已换回样例数据",
  },
  /** 全局搜索（workbench-command.tsx） */
  command: {
    title: "搜索",
    description: "搜索任务、副业、收支或跳转页面",
    placeholder: "搜索任务、副业、收支说明或金额",
    noResults: (query: string) => `没有找到“${query}”`,
    tasks: "任务",
    projects: "副业",
    ledger: "收支",
    goTo: "跳转",
    actions: "操作",
    createTask: (query: string) => `新建任务「${query}」`,
  },
  /** 提醒面板（workbench-notifications.tsx） */
  notifications: {
    title: "提醒",
    unread: (count: number) => `提醒，${count} 条未读`,
    unreadDot: "未读",
    markAllRead: "全部标为已读",
    empty: "没有需要处理的事",
  },
  /** 提醒文字（alerts.ts，函数里现取） */
  alerts: {
    statusOverdue: "逾期",
    statusSlipped: "延期",
    statusPending: "待到账",
    statusFull: "排满",
    capacityTitle: "今天排的比能用的时间多",
    capacityDetail: (planned: string, capacity: string) => `已排 ${planned}，可用 ${capacity}`,
    overdueDetail: (days: number, due: string) => `逾期 ${days} 天 · ${due}截止`,
    slippedTitle: (count: number) => `${count} 件任务没按计划做完`,
    slippedDetail: "挪到今天，或者重新安排日子",
    pendingTitle: (amount: string) => `${amount} 还没到账`,
    pendingDetail: (note: string, expected: string) => `${note} · 约定 ${expected}`,
  },
  /** 快捷键弹框（shortcuts.tsx） */
  shortcuts: {
    title: "键盘快捷键",
    search: "搜索",
    toggleSidebar: "收起或展开侧栏",
    viewShortcuts: "查看快捷键",
  },
  /** 手机侧栏抽屉（mobile-nav.tsx） */
  mobileNav: {
    title: "导航",
    description: "页面与常用视图",
  },
  /** 右上角头像菜单（user-menu.tsx） */
  userMenu: {
    account: (name: string) => `账户：${name}`,
  },
}
