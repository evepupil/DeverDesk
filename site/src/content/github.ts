import { REPO_SLUG, commitUrl } from "./site"

/**
 * 仓库的星数、分支数和最近几次提交：打包时向 GitHub 接口要一次，写进静态页面。
 * 要不到（断网、限流、打包环境设了 SITE_OFFLINE=1）就用下面的快照，页面照常生成。
 * 快照的数字不会显示成假星数：星数拿不到时是 null，页面只写「Star」。
 */

export interface RepoStats {
  /** 拿不到时为 null */
  stars: number | null
  forks: number | null
  openIssues: number | null
  /** 许可证的 SPDX 写法，比如 AGPL-3.0 */
  license: string
  /** GitHub 统计的主要语言 */
  language: string
  /** 最近一次推送的日期 YYYY-MM-DD，拿不到时为 null */
  pushedOn: string | null
}

export interface CommitInfo {
  sha: string
  /** 7 位短编号，页面上显示 */
  shortSha: string
  /** 提交说明的第一行 */
  message: string
  /** 约定式提交的类型（feat、fix、docs、ci……），没有就是 null */
  type: string | null
  /** 去掉类型前缀后的说明 */
  subject: string
  /** 提交日期 YYYY-MM-DD */
  date: string
  url: string
}

export const FALLBACK_STATS: RepoStats = {
  stars: null,
  forks: null,
  openIssues: null,
  license: "AGPL-3.0",
  language: "TypeScript",
  pushedOn: "2026-09-30",
}

/** 2026-09-30 从仓库抄的最近提交；接口要不到时显示它们 */
const FALLBACK_RAW: Array<[string, string, string]> = [
  ["d6ded5cd3a4c6915396f90808810b642ba08577f", "2026-09-30", "chore: 演示站改到 app.deverdesk.com，主域名和 www 留给官网"],
  ["a0456e05be1b23374432b3e41b5585888fdaf8d7", "2026-09-30", "ci: 在 Node 22 和 24 上各跑一遍"],
  ["fb4cb32fb656aa525753c96fb838c3a1a9e4cbf8", "2026-09-30", "fix: 坐标轴紧凑金额写明最少小数位，不同运行时都显示 ¥3500"],
  ["f192f602651fb90d227f29fc81276c773f1ce57e", "2026-09-30", "docs: 中英文 README、贡献指南与安全说明"],
  ["3c362012138ff0ea963b5490f1ab65a46fb81d67", "2026-09-30", "ci: 推送和 Pull Request 自动跑类型检查、代码检查、单元测试和两个版本的打包"],
]

export const FALLBACK_COMMITS: CommitInfo[] = FALLBACK_RAW.map(([sha, date, message]) => toCommit(sha, date, message))

const API = "https://api.github.com"
const TIMEOUT_MS = 5000

function offline(): boolean {
  return process.env.SITE_OFFLINE === "1"
}

function headers(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "deverdesk-site-build",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: headers(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "force-cache",
  })
  if (!response.ok) throw new Error(`GitHub ${path} 返回 ${response.status}`)
  return response.json()
}

function toCommit(sha: string, date: string, message: string): CommitInfo {
  const firstLine = message.split("\n")[0]?.trim() ?? ""
  const match = /^([a-z]+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(firstLine)
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: firstLine,
    type: match ? (match[1] ?? null) : null,
    subject: match ? (match[2] ?? firstLine) : firstLine,
    date,
    url: commitUrl(sha),
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** 解析 GET /repos/{owner}/{repo} 的返回；字段缺了就用快照里的值 */
export function parseRepo(json: unknown): RepoStats {
  const repo = asRecord(json)
  if (!repo) return FALLBACK_STATS
  const license = asRecord(repo.license)
  const spdx = typeof license?.spdx_id === "string" && license.spdx_id !== "NOASSERTION" ? license.spdx_id : FALLBACK_STATS.license
  const pushed = typeof repo.pushed_at === "string" ? repo.pushed_at.slice(0, 10) : FALLBACK_STATS.pushedOn
  return {
    stars: asNumber(repo.stargazers_count),
    forks: asNumber(repo.forks_count),
    openIssues: asNumber(repo.open_issues_count),
    license: spdx,
    language: typeof repo.language === "string" ? repo.language : FALLBACK_STATS.language,
    pushedOn: pushed,
  }
}

/** 解析 GET /repos/{owner}/{repo}/commits 的返回，只取前 limit 条；格式不对的条目跳过 */
export function parseCommits(json: unknown, limit = 5): CommitInfo[] {
  if (!Array.isArray(json)) return []
  const commits: CommitInfo[] = []
  for (const item of json) {
    const record = asRecord(item)
    const commit = asRecord(record?.commit)
    const author = asRecord(commit?.author) ?? asRecord(commit?.committer)
    if (typeof record?.sha !== "string" || typeof commit?.message !== "string" || typeof author?.date !== "string") continue
    commits.push(toCommit(record.sha, author.date.slice(0, 10), commit.message))
    if (commits.length >= limit) break
  }
  return commits
}

/** 打包时取仓库统计；任何一步失败都退回快照 */
export async function getRepoStats(): Promise<RepoStats> {
  if (offline()) return FALLBACK_STATS
  try {
    return parseRepo(await getJson(`/repos/${REPO_SLUG}`))
  } catch {
    return FALLBACK_STATS
  }
}

/** 打包时取最近几次提交；失败或一条都解析不出来就退回快照 */
export async function getRecentCommits(limit = 5): Promise<CommitInfo[]> {
  if (offline()) return FALLBACK_COMMITS.slice(0, limit)
  try {
    const commits = parseCommits(await getJson(`/repos/${REPO_SLUG}/commits?per_page=${limit}`), limit)
    return commits.length > 0 ? commits : FALLBACK_COMMITS.slice(0, limit)
  } catch {
    return FALLBACK_COMMITS.slice(0, limit)
  }
}
