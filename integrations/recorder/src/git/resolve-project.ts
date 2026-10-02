import { statSync } from "node:fs"
import { dirname, join, posix } from "node:path"
import { dirNameFromFacts, dirNameFromPath } from "../core/project-name"
import type { DirNameResolver, GitRunner } from "../core/types"

export interface ResolveOptions {
  /** cwd → 结果 的缓存（读写由调用方负责；可以不给） */
  cache?: Map<string, { dir: string; repo?: string }>
}

/** 返回目录名和仓库根（普通仓库、工作树都是主仓库的根；没用 git 为 undefined） */
export async function resolveDirName(cwd: string, git: GitRunner, options: ResolveOptions = {}): Promise<{ dir: string; repo?: string }> {
  const cached = options.cache?.get(cwd)
  if (cached) return cached

  const common = await git.run(
    ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir", "--is-bare-repository"],
    cwd,
  )
  if (!common.ok) return cacheResult(cwd, { dir: dirNameFromPath(cwd) }, options.cache)

  const lines = common.stdout.split(/\r?\n/)
  const commonDir = lines[0]?.trim()
  const bareText = lines[1]?.trim()
  if (!commonDir || (bareText !== "true" && bareText !== "false")) {
    return cacheResult(cwd, { dir: dirNameFromPath(cwd) }, options.cache)
  }

  const normalizedCommonDir = normalizePath(commonDir)
  const facts: { commonDir?: string; toplevel?: string; superproject?: string; bare?: boolean } = {
    commonDir: normalizedCommonDir,
    bare: bareText === "true",
  }
  if (!facts.bare) {
    const top = await git.run(["-C", cwd, "rev-parse", "--show-toplevel"], cwd)
    if (top.ok && top.stdout.trim()) facts.toplevel = normalizePath(top.stdout.trim())
  }
  if (!normalizedCommonDir.endsWith("/.git")) {
    const parent = await git.run(["-C", cwd, "rev-parse", "--show-superproject-working-tree"], cwd)
    if (parent.ok && parent.stdout.trim()) facts.superproject = normalizePath(parent.stdout.trim())
  }

  const bareWorktreeCommonDir = await findBareWorktreeCommonDir(git, cwd, facts, normalizedCommonDir)
  const dir = bareWorktreeCommonDir
    ? dirNameFromFacts(cwd, { ...facts, commonDir: bareWorktreeCommonDir, bare: true })
    : isSeparateGitDirWorktree(facts, normalizedCommonDir)
      ? posix.basename(facts.toplevel ?? "")
      : dirNameFromFacts(cwd, facts)
  let repo: string | undefined
  if (facts.bare) repo = normalizedCommonDir
  else if (facts.superproject) repo = facts.toplevel
  else if (normalizedCommonDir.endsWith("/.git")) repo = normalizePath(dirname(normalizedCommonDir))
  else repo = facts.toplevel

  return cacheResult(cwd, repo ? { dir, repo } : { dir }, options.cache)
}

/** 给回填用：路径还在磁盘上就用 git 认，已经不在就按路径猜 */
export function createDirNameResolver(git: GitRunner, pathExists: (path: string) => Promise<boolean>): DirNameResolver {
  return async (cwd) => {
    if (!(await pathExists(cwd))) return { dir: dirNameFromPath(cwd) }
    return resolveDirName(cwd, git)
  }
}

async function findBareWorktreeCommonDir(
  git: GitRunner,
  cwd: string,
  facts: { toplevel?: string; superproject?: string; bare?: boolean },
  commonDir: string,
): Promise<string | undefined> {
  if (facts.bare || !facts.toplevel || commonDir.endsWith("/.git")) return undefined
  const match = /^(.*)\/worktrees\/[^/]+$/i.exec(commonDir)
  const root = match?.[1] ?? commonDir
  try {
    if (!statSync(join(facts.toplevel, ".git")).isFile()) return undefined
  } catch {
    return undefined
  }
  const result = await git.run(["-C", cwd, "config", "--bool", "core.bare"], cwd)
  return result.ok && result.stdout.trim() === "true" ? root : undefined
}

function isSeparateGitDirWorktree(
  facts: { toplevel?: string; superproject?: string; bare?: boolean },
  commonDir: string,
): boolean {
  if (facts.bare || facts.superproject || !facts.toplevel || commonDir.endsWith("/.git")) return false
  try {
    return statSync(join(facts.toplevel, ".git")).isFile()
  } catch {
    return false
  }
}

function cacheResult(
  cwd: string,
  result: { dir: string; repo?: string },
  cache: Map<string, { dir: string; repo?: string }> | undefined,
): { dir: string; repo?: string } {
  cache?.set(cwd, result)
  return result
}

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "")
  return normalized || posix.parse(value.replace(/\\/g, "/")).root
}
