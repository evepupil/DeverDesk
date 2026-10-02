/** auth 的界面文字：登录门、登录页、访问令牌和接口报错给人看的话 */
export const auth = {
  /** 登录门（auth-gate.tsx） */
  gate: {
    offline: "连不上服务器",
  },
  /** 登录页（login-screen.tsx） */
  login: {
    passwordLabel: "访问口令",
    empty: "请输入访问口令",
    wrongPassword: "口令不对",
    rateLimited: (minutes: number) => `尝试太多次，${minutes} 分钟后再试`,
    network: "连不上服务器",
    failed: "登录失败，再试一次",
    submitting: "登录中…",
    submit: "登录",
    noPassword: "这个站点还没有设置访问口令",
  },
  /** 连接 AI（tokens-dialog.tsx） */
  tokens: {
    title: "连接 AI",
    description: "管理连上 MCP 的 AI 应用和访问令牌",
    loadFailed: "没能读取连接",
    empty: "还没有连接",
    createdAt: (day: string) => `${day} 创建`,
    /** 经授权页连上的 AI 应用 */
    authorizedAt: (day: string) => `${day} 授权`,
    lastUsed: (day: string) => `${day} 用过`,
    neverUsed: "没用过",
    revoke: "撤销",
    revokeTitle: (name: string) => `撤销「${name}」？`,
    revokeDescription: "撤销后，用这个令牌的程序会马上失效。",
    disconnect: "断开",
    disconnectTitle: (name: string) => `断开「${name}」？`,
    disconnectDescription: "断开后它马上不能再访问，要用时重新授权。",
    /** 顶部的连接器地址：ChatGPT、Claude 网页版这类应用填它，走授权页 */
    connector: {
      label: "连接器地址",
      hint: "ChatGPT、Claude 等添加自定义连接器时填这个地址",
      accessHint: "部署在 Cloudflare Access 后面时，需要给 /mcp、/oauth/*、/.well-known/* 各加一条绕过规则",
    },
    permissionFor: (name: string) => `${name} 的权限`,
    tiers: {
      read: "只看",
      propose: "只能提议",
      write: "直接改",
    },
    tierDescriptions: {
      read: "只能查看数据",
      propose: "改动要你在 AI 动态里采纳",
      write: "改动立即生效，可以撤销",
    },
    connect: {
      clientSelector: "客户端配置",
      clients: {
        claudeCode: "Claude Code",
        codex: "Codex",
        cursor: "Cursor",
        vscode: "VS Code",
        other: "其他",
        recorder: "记录器",
      },
      configurationFor: (client: string) => `${client} 的连接配置`,
      copy: "复制",
      copied: "已复制",
      accessHint: "部署在 Cloudflare Access 后面时，需要给 /mcp 加一条绕过规则",
      recorderAccessHint: "部署在 Cloudflare Access 后面时，需要给 /mcp 和 /api/recorder 各加一条绕过规则",
      recorderPluginCommands: "记录器插件命令",
      recorderSetupCommand: "记录器安装命令",
      recorderCodexHint: "用于 Codex 或手动安装：先从仓库下载 deverdesk-recorder（在 integrations/claude-code/bin 里）；用插件时不需要",
      recorderPermissionHint: "记录器需要「直接改」权限才能上传",
    },
    /** 新建后的令牌：只显示这一次 */
    created: {
      label: "新建的访问令牌",
      copy: "复制",
      copied: "已复制",
      hint: "只显示这一次，现在复制保存好",
    },
    /** 底部的新建表单和报错 */
    form: {
      placeholder: "用途，比如 Claude",
      label: "令牌用途",
      required: "请填写用途",
      tooLong: (max: number) => `最多 ${max} 个字`,
      createFailed: "没能新建，再试一次",
      updateFailed: "没能改权限，再试一次",
      revokeFailed: "没能撤销，再试一次",
      permission: "新令牌权限",
    },
  },
  /** 接口报错给人看的话（lib/api.ts 抛出时取） */
  api: {
    unauthorized: "需要重新登录",
    network: "连不上服务器",
    rateLimited: "尝试太多次",
    serverError: (status: number) => `服务器出错（${status}）`,
  },
}
