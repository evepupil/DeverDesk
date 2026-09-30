import { APP_URL, REPO_SLUG } from "../content/site"

/**
 * 新窗口打开的站外链接用的 rel，全站统一从这里取：
 * - 去自家地方（GitHub 仓库、演示站）的只写 noopener：浏览器会告诉对方「从 deverdesk.com 来」（只带域名，不带具体哪一页），
 *   仓库的流量页（Insights → Traffic）和演示站的访问统计才数得到官网带去了多少人；
 * - 其余站外链接再加 noreferrer，不把来源告诉别家网站。
 */
export function externalRel(href: string): string {
  return isOwnRepo(href) || isDemo(href) ? "noopener" : "noopener noreferrer"
}

/** 地址是不是自家仓库：仓库首页或仓库里的任意一页（提交、文件、编辑页、Issues……） */
export function isOwnRepo(href: string): boolean {
  const url = parseUrl(href)
  if (url === null || url.hostname !== "github.com") return false
  const [owner, repo] = url.pathname.split("/").filter(Boolean)
  return `${owner}/${repo}`.toLowerCase() === REPO_SLUG.toLowerCase()
}

/** 地址是不是演示站 */
export function isDemo(href: string): boolean {
  const url = parseUrl(href)
  return url !== null && url.origin === new URL(APP_URL).origin
}

/** 不是完整地址（比如站内的 /zh/）时返回 null */
function parseUrl(href: string): URL | null {
  try {
    return new URL(href)
  } catch {
    return null
  }
}
