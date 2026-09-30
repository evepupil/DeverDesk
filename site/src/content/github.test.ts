import { afterEach, describe, expect, it, vi } from "vitest"
import { FALLBACK_COMMITS, FALLBACK_STATS, getRecentCommits, getRepoStats, parseCommits, parseRepo } from "./github"

describe("parseRepo", () => {
  it("取出星数、分支数、许可证、语言和最近推送日期", () => {
    const stats = parseRepo({
      stargazers_count: 1234,
      forks_count: 56,
      open_issues_count: 7,
      license: { spdx_id: "AGPL-3.0" },
      language: "TypeScript",
      pushed_at: "2026-10-02T08:30:00Z",
    })
    expect(stats).toEqual({
      stars: 1234,
      forks: 56,
      openIssues: 7,
      license: "AGPL-3.0",
      language: "TypeScript",
      pushedOn: "2026-10-02",
    })
  })

  it("字段缺失或不是对象时退回快照的值，星数为 null", () => {
    expect(parseRepo(null)).toEqual(FALLBACK_STATS)
    const partial = parseRepo({ license: { spdx_id: "NOASSERTION" } })
    expect(partial.stars).toBeNull()
    expect(partial.license).toBe("AGPL-3.0")
    expect(partial.language).toBe("TypeScript")
  })
})

describe("parseCommits", () => {
  const sample = [
    { sha: "147eb33d52187ecc09e9447a1533ed1e7938492b", commit: { message: "feat: 多语言地基\n\n正文", author: { date: "2026-09-30T06:20:28Z" } } },
    { sha: "fb4cb32fb656aa525753c96fb838c3a1a9e4cbf8", commit: { message: "fix(ledger)!: 金额小数位", author: { date: "2026-09-29T10:04:16Z" } } },
    { sha: "bad", commit: { message: 42 } },
    { sha: "0123456789abcdef0123456789abcdef01234567", commit: { message: "Merge branch main", committer: { date: "2026-09-28T00:00:00Z" } } },
  ]

  it("取第一行、拆出类型和说明、日期、短编号和链接，跳过格式不对的", () => {
    const commits = parseCommits(sample)
    expect(commits).toHaveLength(3)
    expect(commits[0]).toMatchObject({
      shortSha: "147eb33",
      message: "feat: 多语言地基",
      type: "feat",
      subject: "多语言地基",
      date: "2026-09-30",
      url: "https://github.com/evepupil/DeverDesk/commit/147eb33d52187ecc09e9447a1533ed1e7938492b",
    })
    expect(commits[1]).toMatchObject({ type: "fix", subject: "金额小数位", date: "2026-09-29" })
    expect(commits[2]).toMatchObject({ type: null, subject: "Merge branch main", date: "2026-09-28" })
  })

  it("按上限截断，非数组返回空", () => {
    expect(parseCommits(sample, 1)).toHaveLength(1)
    expect(parseCommits({})).toEqual([])
  })
})

describe("快照", () => {
  it("5 条、都是 7 位短编号和 YYYY-MM-DD 日期", () => {
    expect(FALLBACK_COMMITS).toHaveLength(5)
    for (const commit of FALLBACK_COMMITS) {
      expect(commit.shortSha).toMatch(/^[0-9a-f]{7}$/)
      expect(commit.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(commit.type).not.toBeNull()
    }
  })
})

describe("离线打包", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("SITE_OFFLINE=1 时不发请求，直接用快照", async () => {
    vi.stubEnv("SITE_OFFLINE", "1")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    expect(await getRepoStats()).toEqual(FALLBACK_STATS)
    expect(await getRecentCommits(3)).toEqual(FALLBACK_COMMITS.slice(0, 3))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("请求失败时退回快照", async () => {
    vi.stubEnv("SITE_OFFLINE", "")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await getRepoStats()).toEqual(FALLBACK_STATS)
    expect(await getRecentCommits()).toEqual(FALLBACK_COMMITS)
  })
})
