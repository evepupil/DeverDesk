// 凭据：环境变量 → Claude Code 插件选项 → config.json。规格见 docs/模块设计/本机记录器.md。
// 占位：由「记录器外壳」那一路实现。

export interface Credentials {
  /** 去掉了结尾斜杠 */
  url: string
  token: string
  source: "env" | "plugin" | "config"
}

/**
 * 读凭据，顺序：DEVERDESK_URL + DEVERDESK_TOKEN → CLAUDE_PLUGIN_OPTION_SERVER_URL + CLAUDE_PLUGIN_OPTION_TOKEN → <home>/config.json。
 * 一对里缺一个就算没有；都没有返回 null。
 */
export function loadCredentials(home: string, env: Record<string, string | undefined> = process.env): Credentials | null {
  void home
  void env
  throw new Error("loadCredentials 还没实现")
}

/** 写 config.json（权限 0600；Windows 上忽略权限） */
export function saveConfig(home: string, config: { url: string; token: string }): void {
  void home
  void config
  throw new Error("saveConfig 还没实现")
}
