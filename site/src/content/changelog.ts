import type { Locale } from "../i18n/locales"
import type { ShotName } from "./screenshots"

/**
 * 更新日志：按真实提交整理，最新的在最前面。
 * 版本号是官网按里程碑编的（仓库还没打标签），打了正式标签后按标签改这里即可。
 * 每条的文字中英文各一份；commits 是这一版对应的提交，页面上显示短编号并链到 GitHub。
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
