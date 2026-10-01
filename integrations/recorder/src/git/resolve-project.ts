// 认目录名：先查缓存，再用一次 git rev-parse，失败就按路径猜。规格见 docs/模块设计/本机记录器.md「认目录名」。
// 占位：由「记录器外壳」那一路实现。
import type { DirNameResolver, GitRunner } from "../core/types"

export interface ResolveOptions {
  /** cwd → 结果 的缓存（读写由调用方负责；可以不给） */
  cache?: Map<string, { dir: string; repo?: string }>
}

/** 返回目录名和仓库根（普通仓库、工作树都是主仓库的根；没用 git 为 undefined） */
export async function resolveDirName(cwd: string, git: GitRunner, options: ResolveOptions = {}): Promise<{ dir: string; repo?: string }> {
  void cwd
  void git
  void options
  throw new Error("resolveDirName 还没实现")
}

/** 给回填用：路径还在磁盘上就用 git 认，已经不在就按路径猜 */
export function createDirNameResolver(git: GitRunner, pathExists: (path: string) => Promise<boolean>): DirNameResolver {
  void git
  void pathExists
  throw new Error("createDirNameResolver 还没实现")
}
