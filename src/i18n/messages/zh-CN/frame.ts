/** 窗口栏、页面框架、显示与筛选、快速记录、计时条、备份和保存提示的界面文字 */
export const frame = {
  /** 窗口栏（window-bar.tsx） */
  windowBar: {
    openNav: "打开导航",
    expandSidebar: "展开侧栏",
    collapseSidebar: "收起侧栏",
    back: "后退",
    forward: "前进",
    search: "搜索",
    shortcuts: "键盘快捷键",
  },
  /** 页面框架（page-frame.tsx） */
  pageFrame: {
    views: "视图",
  },
  /** 显示设置（display-controls.tsx） */
  display: {
    label: "显示",
    reset: "恢复默认",
  },
  /** 筛选菜单和生效中的条件（filter-controls.tsx） */
  filter: {
    label: "筛选",
    count: (n: number) => `${n} 项`,
    /** 多个取值拼成一句时的分隔符 */
    joiner: "、",
    clearAria: (field: string) => `清除${field}条件`,
    clear: "清除",
  },
  /** 手机上的快速记录（quick-capture.tsx） */
  quickCapture: {
    label: "快速记录",
    description: "加一条今天的任务，或者记一笔收支",
    placeholder: "今天要做什么，例如：回复留言 15m",
    income: "记收入",
    expense: "记支出",
  },
  /** 计时条（timer-chip.tsx） */
  timerChip: {
    runningAria: (label: string, elapsed: string) => `正在计时：${label}，已用 ${elapsed}`,
    stop: "停止计时",
    logged: (minutes: string) => `记下 ${minutes}`,
    tooShort: "不到一分钟，没有记录",
  },
  /** 本地保存失败的提示（persistence-feedback.tsx） */
  persistence: {
    saveFailed: "没能保存到本机",
    saveFailedHint: "修改在关闭页面前仍然有效",
    saved: "已保存到本机",
  },
  /** 导出 / 导入备份（backup.tsx） */
  backup: {
    exported: "已导出备份文件",
    importFailed: "没能导入",
    replaceTitle: (name: string) => `用「${name}」替换现有数据？`,
    replaceBody: (tasks: number, entries: number) =>
      `备份里有 ${tasks} 件任务、${entries} 笔收支。现在的数据会被替换，建议先导出一份。`,
    replace: "替换",
    imported: "已导入备份",
    /** 导入时检查备份文件的报错（domain/backup.ts） */
    parse: {
      invalidJson: "文件不是有效的 JSON",
      notBackup: "这不是工作台导出的备份文件",
      unknownVersion: "备份文件的版本不认识",
      noData: "备份文件里没有数据",
      missingList: (key: string) => `备份文件缺少「${key}」`,
      badProfile: "备份文件里的作息设置不完整",
    },
  },
}
