// 从 git 查到的事实算目录名。纯函数。规格见「认项目：只看文件夹名」。

/** 一次 git rev-parse 查到的事实（路径统一用正斜杠；查不到的为 undefined） */
export interface GitFacts {
  commonDir?: string
  toplevel?: string
  superproject?: string
  bare?: boolean
}

/** 按仓库事实认目录名；git 事实缺失时退回到 cwd。 */
export function dirNameFromFacts(cwd: string, facts: GitFacts): string {
  const commonDir = normalizePath(facts.commonDir ?? "")
  const toplevel = normalizePath(facts.toplevel ?? "")
  if (facts.bare && commonDir) return pathName(commonDir).replace(/\.git$/i, "")
  if (facts.superproject?.trim() && toplevel) return pathName(toplevel)
  if (/(?:^|\/)\.git$/i.test(commonDir)) return pathName(parentPath(commonDir))
  if (commonDir) return pathName(commonDir).replace(/\.git$/i, "")
  return dirNameFromPath(cwd)
}

/** 没有可用 git 事实时，去掉末尾的 /.claude/worktrees/<名字> 再取目录名。 */
export function dirNameFromPath(cwd: string): string {
  const normalized = normalizePath(cwd)
  if (!normalized) return ""
  if (/^[a-z]:\/?$/i.test(normalized)) return normalized.slice(0, 2)

  const parts = normalized.split("/").filter(Boolean)
  if (parts.length >= 3
    && parts[parts.length - 3]?.toLowerCase() === ".claude"
    && parts[parts.length - 2]?.toLowerCase() === "worktrees") {
    parts.splice(-3)
  }
  return parts[parts.length - 1] ?? ""
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "")
}

function pathName(path: string): string {
  const normalized = normalizePath(path)
  if (!normalized) return ""
  if (/^[a-z]:$/i.test(normalized)) return normalized
  const parts = normalized.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? ""
}

function parentPath(path: string): string {
  const normalized = normalizePath(path)
  const slash = normalized.lastIndexOf("/")
  if (slash < 0) return ""
  if (slash === 2 && /^[a-z]:\//i.test(normalized)) return normalized.slice(0, 3)
  if (slash === 0) return "/"
  return normalized.slice(0, slash)
}
