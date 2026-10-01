// 从 git 查到的事实算目录名。纯函数。规格见 docs/模块设计/编程自动记录.md「认项目：只看文件夹名」。
// 占位：由「引擎」那一路实现。

/** 一次 git rev-parse 查到的事实（路径统一用正斜杠；查不到的为 undefined） */
export interface GitFacts {
  /** --path-format=absolute --git-common-dir */
  commonDir?: string
  /** --show-toplevel（裸仓库没有） */
  toplevel?: string
  /** --show-superproject-working-tree（子模块有，普通仓库为空） */
  superproject?: string
  /** --is-bare-repository */
  bare?: boolean
}

/**
 * 目录名：
 * - 公共目录以 /.git 结尾：它上一级文件夹名（普通仓库、子文件夹、工作树都落在这里）
 * - 有 superproject（子模块）：toplevel 的最后一段
 * - 裸仓库：公共目录最后一段，去掉 .git 后缀
 * - 都没有（不是 git 仓库）：cwd 的最后一段
 * 路径里的反斜杠先换成正斜杠，末尾斜杠忽略；cwd 是盘符根目录时取盘符（如 "C:"）。
 */
export function dirNameFromFacts(cwd: string, facts: GitFacts): string {
  void cwd
  void facts
  throw new Error("dirNameFromFacts 还没实现")
}

/** 没有 git 可用、目录也已经不在磁盘上时，从路径猜目录名：去掉末尾的 /.claude/worktrees/<名字>，再取最后一段 */
export function dirNameFromPath(cwd: string): string {
  void cwd
  throw new Error("dirNameFromPath 还没实现")
}
