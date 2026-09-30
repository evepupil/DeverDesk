import type { Locale } from "../i18n/locales"

/**
 * 官网里所有指向站外的地址和第三方服务的设置集中在这里。fork 之后换成自己的仓库和演示站，只改这一个文件
 * （或在打包时用环境变量覆盖）。
 */

/** 官网自己的域名：生成绝对地址（canonical、hreflang、分享卡片、站点地图）时用 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deverdesk.com"

/**
 * Cloudflare 网页统计的令牌（后台 Web Analytics 里站点代码中的 token）。
 * 打包时从环境变量读，写在不提交的 .env.production.local 里；没配就不加统计，本地预览、持续集成和 fork 出去的官网都不统计。
 */
export const ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_ANALYTICS_TOKEN || ""

/** 「在线试用」打开的演示站：本地版，带样例数据，数据只存在访客自己的浏览器里 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.deverdesk.com"

/** 仓库 owner/name，GitHub 接口和各种链接都从它拼 */
export const REPO_SLUG = process.env.NEXT_PUBLIC_REPO_SLUG || "evepupil/DeverDesk"

export const REPO_URL = `https://github.com/${REPO_SLUG}`

/** Cloudflare 一键部署：把仓库复制到访客自己的账号并部署在线版 */
export const DEPLOY_URL = `https://deploy.workers.cloudflare.com/?url=${REPO_URL}`

export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
export const ISSUES_URL = `${REPO_URL}/issues`
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`
export const CONTRIBUTING_URL = `${REPO_URL}/blob/main/CONTRIBUTING.md`
export const RELEASES_URL = `${REPO_URL}/releases`
/** 「关注更新」：GitHub 仓库页右上角的 Watch，选 Releases 就能收到发布通知 */
export const WATCH_URL = `${REPO_URL}/subscription`

/** 某次提交在 GitHub 上的页面 */
export function commitUrl(sha: string): string {
  return `${REPO_URL}/commit/${sha}`
}

/** 仓库里某个文件的 GitHub 编辑页（「在 GitHub 上编辑此页」） */
export function editUrl(pathInRepo: string): string {
  return `${REPO_URL}/edit/main/${pathInRepo.replace(/^\/+/, "")}`
}

/** 讲怎么部署的文档：英文在仓库首页，中文在 README.zh-CN.md */
export function deployGuideUrl(locale: Locale): string {
  return locale === "zh" ? `${REPO_URL}/blob/main/README.zh-CN.md#部署在线版` : `${REPO_URL}#deploy-your-own`
}

/** 仓库说明文档（README）按语言 */
export function readmeUrl(locale: Locale): string {
  return locale === "zh" ? `${REPO_URL}/blob/main/README.zh-CN.md` : REPO_URL
}

/** 克隆地址，开源区块的终端里显示 */
export const CLONE_URL = `${REPO_URL}.git`

/** 仓库目录名：终端里 cd 用 */
export const REPO_DIR = REPO_SLUG.split("/")[1] ?? "DeverDesk"

/** 许可证 */
export const LICENSE_NAME = "AGPL-3.0"
