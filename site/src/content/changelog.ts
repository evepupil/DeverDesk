import type { Locale } from "../i18n/locales"
import type { ShotName } from "./screenshots"

/**
 * 更新日志：按真实提交整理，最新的在最前面。
 * 每个版本号都是仓库里的一个 Git 标签，也有一条同名的 GitHub Release。
 * 加新版本时：先在这里写一条并把产品版本号改好，提交、推送，等自动检查通过后在这个提交上打同名标签、发 Release（说明取这里的中英文）。
 * 每条的文字中英文各一份；commits 是这一版对应的提交（v0.4.1 及以前列全了，之后每个功能列一个主提交），页面上显示短编号并链到 GitHub。
 */

export type ChangeKind = "new" | "improved" | "fixed"

export interface ChangelogEntry {
  /** 形如 v0.4.1，页面左侧吸顶显示 */
  version: string
  /** YYYY-MM-DD */
  date: string
  title: Record<Locale, string>
  summary: Record<Locale, string>
  changes: Array<{ kind: ChangeKind; text: Record<Locale, string> }>
  /** 这一版对应的提交（完整编号），第一个是主提交 */
  commits: string[]
  /** 配图：产品截图的名字，按页面语言取中文或英文截图 */
  shot?: ShotName
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v0.5.0",
    date: "2026-10-02",
    title: { zh: "AI 助手接进来：MCP、OAuth 和写代码自动记录", en: "AI assistants: MCP, OAuth and automatic coding time" },
    summary: {
      zh: "Claude Code、Codex、ChatGPT、Claude 都能连上你自己的 DeverDesk，替你查情况、记一笔、排日程；每次改动留底，随时可以撤销。写代码的时间和任务也能自动记下来。",
      en: "Claude Code, Codex, ChatGPT and Claude can connect to your own DeverDesk to check status, log entries and plan your days. Every change is recorded and can be undone, and your coding time can be tracked automatically.",
    },
    changes: [
      { kind: "new", text: { zh: "在线版开放 MCP 服务：AI 助手能查今天和本周、记收支、建任务、计时、把任务排进空档", en: "The cloud edition is now an MCP server: assistants can read your day and week, record money, create tasks, run the timer and schedule tasks into free time" } },
      { kind: "new", text: { zh: "每个连接选一档权限：只看、只能提议（默认）、直接改", en: "Every connection gets a permission level: read only, propose (the default) or write" } },
      { kind: "new", text: { zh: "AI 动态：每次改动留底，可以采纳提议、撤销改动；删除或一次改超过十条会先给预览", en: "AI activity: every change is recorded, proposals can be accepted and changes undone; deletions and bulk edits show a preview first" } },
      { kind: "new", text: { zh: "OAuth 授权：ChatGPT、Claude 网页版和手机版只填连接器地址，在授权页登录、选权限、点允许；授权连接和手动令牌在同一个列表里管理", en: "OAuth sign-in: ChatGPT and Claude on the web and mobile connect with just the connector address. Sign in on the authorization page, pick a permission and allow; authorized connections and manual tokens share one list" } },
      { kind: "new", text: { zh: "编程自动记录：Claude Code 插件和 Codex 钩子把写代码的时间和任务记下来，按文件夹名认副业，绑定后才上传；今天页显示投入、进行中和实际轨道", en: "Automatic coding time: a Claude Code plugin and Codex hooks log the time and tasks of your coding sessions. Folders are matched to projects by name and nothing uploads until you bind one; the Today page shows time spent, work in progress and an actual-time rail" } },
      { kind: "new", text: { zh: "副业里程碑可以改名、改日期、删除，删除带撤销", en: "Project milestones can be renamed, rescheduled and deleted, with undo for deletions" } },
      { kind: "new", text: { zh: "官网 deverdesk.com 上线：中英文首页、更新日志和博客，代码在仓库的 site 目录里", en: "The website deverdesk.com is live with a landing page, changelog and blog in English and Chinese; its source is in the repository's site folder" } },
      { kind: "improved", text: { zh: "AI 助手查统计时按最近 7、30、90、365 天滚动，并和前一段同样长的时间对比；读到的任务带上备注和子任务", en: "When assistants ask for stats they get rolling 7, 30, 90 or 365-day windows compared with the period just before, and the tasks they read include notes and subtasks" } },
      { kind: "fixed", text: { zh: "AI 助手读到的周复盘里，已完成任务的完成时间被时区多算了一次（东八区晚 8 小时），每天的计划时长也没算上例行事项", en: "In the weekly review that assistants read, completion times had the time zone applied twice (8 hours late in UTC+8) and each day's planned time left out routines" } },
      { kind: "fixed", text: { zh: "侧栏打开时，提示条上的「撤销」点不到", en: "The Undo button in toasts could not be clicked while a side panel was open" } },
    ],
    commits: [
      "8f4dc46c2d6da605c001c61a8d9abb3fbf3d6a77",
      "34c825a2e1772135432f8015a6f66920074e59a9",
      "ddee91ef2f9d1687735125bc2620f9d0d1018d2f",
      "0d8aa4f4216faeb2cfaf3d77ddea5afc79c02f8f",
      "8faf2556cd547a677f7b77db80aede07ada35ff9",
      "83d7abe15aac5f5bd540c1e74e367c822653047f",
      "a7607c6f7dd6dbc05a70a6986a6c42e0db250937",
      "0c65a2ed603fa4ea909a6d1d41dbde02fb12ab9b",
      "e156a9b07ab22483ae589ee46f584ba6eb100778",
      "f5e26119b3b4c93c27f27f25d9a6ee5a6cca8119",
      "7c7d2034be83ca620242621687130e3e98d1fc71",
      "b2e5cc1464631d31489ad7efb0ea78d3538e22a6",
      "402a949d38002c49e9c60b161a002d10021bf4c6",
    ],
  },
  {
    version: "v0.4.1",
    date: "2026-09-30",
    title: { zh: "演示站上线，仓库门面补齐", en: "Live demo, English README and CI" },
    summary: {
      zh: "不用注册、不用部署，打开演示站就能用带样例数据的本地版；仓库首页换成英文 README，每次推送都自动检查。",
      en: "Try the local edition with sample data straight from the demo site — no sign-up, nothing to deploy. The repository now opens with an English README, and every push is checked automatically.",
    },
    changes: [
      { kind: "new", text: { zh: "演示站上线：本地版带样例数据，数据只存在你自己的浏览器里", en: "Live demo of the local edition with sample data; everything stays in your browser" } },
      { kind: "new", text: { zh: "英文 README 做仓库首页，中文单独一份，两边互相链接", en: "English README as the repository home page, with a linked Chinese version" } },
      { kind: "new", text: { zh: "贡献指南和安全说明", en: "Contributing guide and security policy" } },
      { kind: "new", text: { zh: "持续集成：每次推送都在 Node 22 和 24 上跑类型检查、代码检查、单元测试和两个版本的打包", en: "CI: every push runs type checks, lint, unit tests and both edition builds on Node 22 and 24" } },
      { kind: "improved", text: { zh: "本地版里的部署说明按界面语言打开中文或英文 README", en: "Deploy links in the local edition open the README in your interface language" } },
      { kind: "fixed", text: { zh: "图表坐标轴的紧凑金额在不同运行环境下显示一致", en: "Compact amounts on chart axes now look the same on every runtime" } },
    ],
    commits: [
      "e95ef03c9771c265cc6d6d5543fa1787d84f54ea",
      "f192f602651fb90d227f29fc81276c773f1ce57e",
      "3c362012138ff0ea963b5490f1ab65a46fb81d67",
      "fb4cb32fb656aa525753c96fb838c3a1a9e4cbf8",
      "a0456e05be1b23374432b3e41b5585888fdaf8d7",
      "d6ded5cd3a4c6915396f90808810b642ba08577f",
    ],
  },
  {
    version: "v0.4.0",
    date: "2026-09-30",
    title: { zh: "中英双语", en: "English and Chinese" },
    summary: {
      zh: "界面文字全部进了词条，中文、英文两套逐条对应；日期、时长、金额都按语言显示。",
      en: "Every piece of interface text now lives in a dictionary, in English and Chinese, and dates, durations and amounts follow your language.",
    },
    changes: [
      { kind: "new", text: { zh: "第一次打开按浏览器语言选中文或英文，头像菜单里随时切换", en: "Picks English or Chinese from your browser on first launch; switch any time from the avatar menu" } },
      { kind: "new", text: { zh: "日期、时长、金额按语言格式化；记账币种单独设置，可选 10 种货币", en: "Dates, durations and amounts follow your language; the bookkeeping currency is a separate setting with 10 currencies" } },
      { kind: "new", text: { zh: "快速添加认英文写法：today、tomorrow、fri、next tue、45min、2hr", en: "Quick add understands English: today, tomorrow, fri, next tue, 45min, 2hr" } },
      { kind: "improved", text: { zh: "演示用的样例数据有中英文两套，数字完全一样", en: "Sample data comes in both languages with identical numbers" } },
    ],
    commits: ["147eb33d52187ecc09e9447a1533ed1e7938492b", "9fe1a4d1408f5d4b2508525b718cd9ac7ec0e4d0"],
    shot: "today",
  },
  {
    version: "v0.3.0",
    date: "2026-09-30",
    title: { zh: "在线版：部署到你自己的 Cloudflare", en: "Cloud edition on your own Cloudflare" },
    summary: {
      zh: "一个 Worker 加一个 D1 数据库，一键部署到你自己的账号；手机和电脑按条同步，断网也能接着用。",
      en: "One Worker and one D1 database, deployed to your own account in one click. Phones and computers sync record by record, and it keeps working offline.",
    },
    changes: [
      { kind: "new", text: { zh: "Cloudflare Worker + D1 后端，附一键部署按钮", en: "Cloudflare Worker + D1 backend with a one-click deploy button" } },
      { kind: "new", text: { zh: "按条同步：两台设备改同一份数据会自动合并；断网时先存在本机，联网后补传", en: "Record-by-record sync: edits from two devices merge automatically, and offline changes upload once you are back" } },
      { kind: "new", text: { zh: "访问口令登录，也可以放在 Cloudflare Access 后面", en: "Passcode sign-in, or put it behind Cloudflare Access" } },
      { kind: "new", text: { zh: "个人访问令牌和自动化接口：建任务、记一笔、取月度汇总", en: "Personal access tokens and an automation API: create tasks, record entries, read monthly summaries" } },
    ],
    commits: ["e2345b7eb7c99f4a4421ad57b57dedd5b7f22a59", "996630e7e872ab2c19b23e1152f8571bb478f60d"],
    shot: "ledger",
  },
  {
    version: "v0.2.0",
    date: "2026-09-30",
    title: { zh: "本地版和在线版，同一套代码", en: "Local and cloud editions from one codebase" },
    summary: {
      zh: "数据读写抽成可以替换的一层，打包时选本地版还是在线版；本地版的数据只存在这台设备的浏览器里。",
      en: "Reading and writing data became a swappable layer, and a build-time switch picks the edition. The local edition keeps your data in this browser only.",
    },
    changes: [
      { kind: "new", text: { zh: "存储层可替换：换一种存法，页面一行不用改", en: "A swappable storage layer: change where data lives without touching a single page" } },
      { kind: "new", text: { zh: "打包时切换本地版 / 在线版，默认在线版", en: "Build-time switch between the local and cloud editions (cloud by default)" } },
      { kind: "new", text: { zh: "本地版第一次打开有说明弹框，右上角有 GitHub 图标", en: "The local edition explains itself on first launch and links to GitHub from the top bar" } },
      { kind: "new", text: { zh: "演示站的部署配置", en: "Deployment config for the demo site" } },
    ],
    commits: ["da5979fc320953b49d6cafd84ead1707bcfa6bd7"],
    shot: "tasks",
  },
  {
    version: "v0.1.0",
    date: "2026-09-30",
    title: { zh: "开源首发", en: "First open-source release" },
    summary: {
      zh: "一人公司的工作台单独成仓库，以 AGPL-3.0 开源：任务、时间和副业收支放在一起。",
      en: "The one-person company console gets its own repository under AGPL-3.0: tasks, time and side-project money in one place.",
    },
    changes: [
      { kind: "new", text: { zh: "八个页面：今天、本周、任务、副业、收支、概览、回顾、例行", en: "Eight views: Today, Week, Tasks, Projects, Ledger, Insights, Review and Routines" } },
      { kind: "new", text: { zh: "每个副业的本月净收入、投入时间和时薪", en: "Net income, hours and hourly rate for every project this month" } },
      { kind: "new", text: { zh: "Ctrl/⌘ K 搜索、一行快速添加、计时条和提醒", en: "Command palette, one-line quick add, a running timer and alerts" } },
      { kind: "new", text: { zh: "以 AGPL-3.0 许可证开源", en: "Released under the AGPL-3.0 license" } },
    ],
    commits: ["dea660faeaeb6915657d11ab6717e13371b41768"],
    shot: "projects",
  },
]
