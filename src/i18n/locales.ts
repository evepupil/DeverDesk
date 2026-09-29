/** 支持的界面语言。加一种语言：这里加一项，再在 messages 下照 zh-CN 补一套词条 */
export const LOCALES = ["zh-CN", "en"] as const

export type Locale = (typeof LOCALES)[number]

/** 静态页面按它预渲染；也是没法判断浏览器语言时的兜底 */
export const DEFAULT_LOCALE: Locale = "zh-CN"

/** 语言菜单里显示的名字，各用各的语言写 */
export const LOCALE_NAMES: Record<Locale, string> = {
  "zh-CN": "中文", // i18n-ignore 语言名用它自己的语言写
  en: "English",
}

/** 记账币种的默认值：老数据和没设过币种的个人设置都按它显示 */
export const DEFAULT_CURRENCY = "CNY"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/** 没选过语言时按浏览器语言猜：中文用中文，其余一律英文 */
export function detectLocale(languages: readonly string[]): Locale {
  if (languages.length === 0) return DEFAULT_LOCALE
  for (const language of languages) {
    const lower = language.toLowerCase()
    if (lower.startsWith("zh")) return "zh-CN"
    if (lower.startsWith("en")) return "en"
  }
  return "en"
}
