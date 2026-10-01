// git 命令的真实运行器（child_process.execFile，带超时，不经过 shell）。接口 GitRunner 在 core/types.ts。
// 占位：由「记录器外壳」那一路实现。
import type { GitRunner } from "../core/types"

export function createGitRunner(): GitRunner {
  throw new Error("createGitRunner 还没实现")
}
