/**
 * 版本开关：打包时决定是本地版还是在线版，默认在线版。
 * - 本地版：数据只存在这个浏览器里；用来做演示站，也给不想部署的人直接用。
 * - 在线版：连自己部署的 Cloudflare 后端，多设备同步。
 * 本地版打包：NEXT_PUBLIC_DEVERDESK_EDITION=local（或 pnpm build:local）。
 */

export type Edition = "local" | "cloud"

function readEdition(raw: string | undefined): Edition {
  return raw === "local" ? "local" : "cloud"
}

// 环境变量必须按全名直接读取，打包时才会被替换成具体的值
export const EDITION: Edition = readEdition(process.env.NEXT_PUBLIC_DEVERDESK_EDITION)
export const IS_LOCAL_EDITION = EDITION === "local"

/** 仓库地址：本地版右上角的 GitHub 图标、说明弹框里的「部署在线版」都指向这里；fork 后可以换成自己的 */
export const REPO_URL = process.env.NEXT_PUBLIC_DEVERDESK_REPO_URL || "https://github.com/evepupil/DeverDesk"

/** 仓库首页里讲怎么部署在线版的那一节 */
export const DEPLOY_GUIDE_URL = `${REPO_URL}#在线版部署` // i18n-ignore 指向 README 的章节

/** Cloudflare 网页统计的令牌：只在本地版、并且配了令牌时才加统计脚本 */
export const ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_DEVERDESK_ANALYTICS_TOKEN || ""

/** 本地版说明弹框看过的记号，存在浏览器里 */
export const LOCAL_NOTICE_KEY = "deverdesk:local-notice-seen"
