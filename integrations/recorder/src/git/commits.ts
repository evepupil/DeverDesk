// 提交相关的 git 操作：发现新提交、按时间范围找提交。规格见 docs/模块设计/本机记录器.md「提交怎么发现」。
// 占位：由「记录器外壳」那一路实现。
import type { CommitFinder, CommitInfo, GitRunner } from "../core/types"

/** 某个仓库的提交状态（存在 state.json 里） */
export interface RepoState {
  head: string
  lastCommitAt: number
  /** 最近 200 个「作者时间|说明」，amend 后不重复记 */
  seen: string[]
}

/** 发现自上次以来的新提交；第一次见到这个仓库只记基线，返回空 */
export async function detectNewCommits(
  git: GitRunner,
  repoRoot: string,
  previous: RepoState | undefined,
): Promise<{ commits: CommitInfo[]; next: RepoState | undefined }> {
  void git
  void repoRoot
  void previous
  throw new Error("detectNewCommits 还没实现")
}

/** 按时间范围找提交（回填用）；作者邮箱和仓库配置不一致的丢掉，不含合并提交 */
export function createCommitFinder(git: GitRunner): CommitFinder {
  void git
  throw new Error("createCommitFinder 还没实现")
}
