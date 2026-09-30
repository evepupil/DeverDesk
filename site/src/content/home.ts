import type { ShotName } from "./screenshots"

/**
 * 首页各区块的结构数据：有几项、按什么顺序、用哪张截图、插画里的颜色和位置。
 * 文字不在这里，按同名的键去词条 t.home.* 里取。图标是界面的事，由区块自己按键对应。
 */

/** 产品导览的八个页签，顺序即显示顺序；键同时是截图名和词条 t.home.tour.items 的键 */
export const TOUR_KEYS = ["today", "week", "tasks", "projects", "ledger", "insights", "review", "routines"] as const satisfies readonly ShotName[]

export type TourKey = (typeof TOUR_KEYS)[number]

/** 功能区下方的六个小功能，键对应 t.home.features.small */
export const SMALL_FEATURE_KEYS = ["review", "routines", "backup", "search", "alerts", "timer"] as const

export type SmallFeatureKey = (typeof SMALL_FEATURE_KEYS)[number]

/** 「每个副业的真实时薪」插画里三行副业的方块颜色，和产品样例数据一致（模板商城、接口中转、技术博客） */
export const RATE_ROW_COLORS = ["indigo", "blue", "teal"] as const

/** 时薪插画里每行右侧的横条长度（相对最高时薪的比例：123 / 207 / 30） */
export const RATE_ROW_BARS = [0.59, 1, 0.14] as const

/** 「钱到没到账」插画里三条消息的状态：待到账、已到账、过期未到 */
export const MONEY_ITEM_TONES = ["pending", "received", "late"] as const

/** 月目标进度（插画里的环形进度条），和词条里的 68% 一致 */
export const GOAL_PROGRESS = 0.68

/** 月目标卡下方「最近 12 周净收入」小柱图的相对高度（0～1），最后一根是本周 */
export const WEEKLY_NET_BARS = [0.34, 0.5, 0.42, 0.6, 0.55, 0.72, 0.46, 0.66, 0.8, 0.7, 0.92, 0.68] as const

/**
 * 「今天」插画的时间线：从 9 点排到 13 点；三个已排的块（开始小时、时长小时、颜色）、「现在」线的位置，
 * 以及正被拖进来的那张卡要落下的位置（12:00 开始，45 分钟）。块与块、块与落点互不重叠。
 */
export const TODAY_TIMELINE = {
  startHour: 9,
  endHour: 13,
  blocks: [
    { start: 9, hours: 0.5, color: "teal" },
    { start: 10, hours: 1, color: "gray" },
    { start: 11.25, hours: 0.5, color: "indigo" },
  ],
  now: 9.75,
  drop: { start: 12, hours: 0.75 },
} as const

/** 两种用法区块的三个设备，顺序即显示顺序；截图名决定设备屏幕里放哪一页 */
export const DEVICE_KEYS = ["phone", "laptop", "tablet"] as const

export const DEVICE_SHOTS: Record<(typeof DEVICE_KEYS)[number], ShotName> = {
  phone: "today",
  laptop: "week",
  tablet: "insights",
}

/** 两种用法区块下方三张卡，键对应 t.home.editions.cards */
export const EDITION_CARD_KEYS = ["local", "cloud", "own"] as const

/** 在线版卡片里的世界地图连线：Cloudflare 数据中心所在的几座城市之间 */
export const MAP_ARCS = [
  { start: { lat: 31.23, lng: 121.47 }, end: { lat: 37.77, lng: -122.42 } },
  { start: { lat: 31.23, lng: 121.47 }, end: { lat: 1.35, lng: 103.82 } },
  { start: { lat: 50.11, lng: 8.68 }, end: { lat: 31.23, lng: 121.47 } },
  { start: { lat: 37.77, lng: -122.42 }, end: { lat: -23.55, lng: -46.63 } },
] as const

/**
 * 场景墙（桌面）：正中上方一个「亮起」的位置轮流显示十张卡；四周八张淡出的卡固定摆放，
 * 显示第 3～10 张（下标 2～9）。位置是相对区块的百分比，宽度是 px；
 * 中间一列（左右 36%～64%）留给亮起的卡、标题和按钮，淡卡不进这一列。固定写死，服务端和浏览器渲染一致。
 */
export const SCENARIO_AMBIENT = [
  { card: 2, top: 6, left: 2, width: 300 },
  { card: 3, top: 4, left: 72, width: 300 },
  { card: 4, top: 33, left: -3, width: 290 },
  { card: 5, top: 30, left: 79, width: 290 },
  { card: 6, top: 60, left: 3, width: 310 },
  { card: 7, top: 63, left: 75, width: 300 },
  { card: 8, top: 84, left: 16, width: 300 },
  { card: 9, top: 86, left: 60, width: 300 },
] as const

/** 场景墙轮流点亮的间隔（毫秒） */
export const SCENARIO_INTERVAL_MS = 4000

/** 常见问题的三组，顺序即显示顺序，键对应 t.home.faq.groups */
export const FAQ_GROUP_KEYS = ["product", "deploy", "openSource"] as const

/** 收尾区右侧拼贴用的截图，两列各三张 */
export const CTA_COLLAGE: ShotName[][] = [
  ["projects", "ledger", "review"],
  ["week", "insights", "routines"],
]
