import type { Locale } from "../i18n/locales"

/**
 * 官网用到的产品截图：由 scripts/app-shots.mjs 从产品的本地版打包结果里截出来，
 * 中文、英文各一套，放在 public/screenshots/<语言>/<名字>.webp。
 * 页面只通过 shotSrc 取地址，不自己拼路径；宽高写进 <img>，加载时不跳动。
 */

export const SHOT_NAMES = ["today", "week", "tasks", "projects", "ledger", "insights", "review", "routines"] as const

export type ShotName = (typeof SHOT_NAMES)[number]

/** 桌面截图：1440×900 的窗口按 2 倍像素截，文件是 2880×1800 */
export const DESKTOP_SHOT = { width: 2880, height: 1800 } as const

/** 手机截图：390×844 的窗口按 3 倍像素截 */
export const MOBILE_SHOT = { width: 1170, height: 2532 } as const

export function shotSrc(name: ShotName, locale: Locale): string {
  return `/screenshots/${locale}/${name}.webp`
}

/** 手机上的「今天」页，两种用法区块里的手机框用 */
export function mobileShotSrc(locale: Locale): string {
  return `/screenshots/${locale}/today-mobile.webp`
}
