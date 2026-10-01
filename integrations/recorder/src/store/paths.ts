// 本机文件的位置。规格见 docs/模块设计/本机记录器.md「本机文件」。
// 占位：由「记录器外壳」那一路实现。

/** 根目录：环境变量 DEVERDESK_HOME，没有就是 ~/.deverdesk */
export function recorderHome(env: Record<string, string | undefined> = process.env): string {
  void env
  throw new Error("recorderHome 还没实现")
}
