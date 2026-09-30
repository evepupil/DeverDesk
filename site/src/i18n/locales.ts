/**
 * 官网的语言：地址第一段就是语言（/zh/…、/en/…），每种语言各导出一套静态页面。
 * 根地址 / 不放内容，只按下面的 pickLocale 选好语言再跳过去（服务端跳转见 root-redirect.ts，兜底脚本见 redirect-script.ts）。
 */

export const LOCALES = ["zh", "en"] as const

export type Locale = (typeof LOCALES)[number]

/** 选不出来时用英文：非中文访客看英文更容易上手（和产品本身的做法一致） */
export const DEFAULT_LOCALE: Locale = "en"

/** 页面 <html lang> 和 hreflang 用的语言标记 */
export const HTML_LANG: Record<Locale, string> = { zh: "zh-CN", en: "en" }

/** 分享卡片（Open Graph）用的地区写法 */
export const OG_LOCALE: Record<Locale, string> = { zh: "zh_CN", en: "en_US" }

/** 语言名各用各的语言写，切换器里不跟着界面语言变 */
export const LOCALE_NAMES: Record<Locale, string> = { zh: "中文", en: "English" }

/** 访客手动选过的语言记在 Cookie 里：根地址的服务端跳转和兜底脚本都读它，下次打开根地址直接用 */
export const LOCALE_COOKIE = "deverdesk-site-locale"

/** 记住一年 */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/**
 * 根地址选语言：存过就用存的；否则浏览器语言里只要有 zh 开头的就用中文；其余一律英文。
 * languages 在浏览器里传 navigator.languages（没有时传 [navigator.language]），在服务端传 parseAcceptLanguage 的结果。
 */
export function pickLocale(stored: string | null | undefined, languages: readonly string[]): Locale {
  if (isLocale(stored)) return stored
  const prefersChinese = languages.some((language) => language.toLowerCase().startsWith("zh"))
  return prefersChinese ? "zh" : DEFAULT_LOCALE
}

/** 语言切换时写进 document.cookie 的一整条：全站有效，一年后过期 */
export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
}

/**
 * 从 Cookie 字符串里取出记住的语言，没有就是 null。
 * 请求头 Cookie 和 document.cookie 都是「名=值; 名=值」的写法，两边共用；同名的取第一条。
 */
export function readLocaleCookie(cookies: string | null | undefined): string | null {
  if (!cookies) return null
  for (const part of cookies.split(";")) {
    const pair = part.trim()
    if (pair.startsWith(`${LOCALE_COOKIE}=`)) return pair.slice(LOCALE_COOKIE.length + 1)
  }
  return null
}

/**
 * 请求头 Accept-Language 拆成语言列表，保持原来的顺序；明确标了 q=0（不接受）的去掉。
 * 例："zh-CN,zh;q=0.9,en;q=0.8" → ["zh-CN", "zh", "en"]
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return []
  return header.split(",").flatMap((item) => {
    const [tag = "", ...params] = item.split(";").map((piece) => piece.trim())
    const quality = params.find((param) => param.startsWith("q="))
    if (!tag || (quality !== undefined && Number(quality.slice(2)) === 0)) return []
    return [tag]
  })
}

/**
 * 站内地址：localePath("zh") → "/zh/"，localePath("en", "/blog/") → "/en/blog/"。
 * 全站开了 trailingSlash，这里保证结尾一定带斜杠；带 # 锚点的原样保留锚点。
 */
export function localePath(locale: Locale, path = "/"): string {
  const [pathname, hash] = path.split("#") as [string, string | undefined]
  const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "")
  const base = trimmed ? `/${locale}/${trimmed}/` : `/${locale}/`
  return hash !== undefined ? `${base}#${hash}` : base
}

/**
 * 把当前地址换成另一种语言的同一页：/zh/blog/hourly-rate/ → /en/blog/hourly-rate/。
 * 地址里没有语言段（比如根地址）时，给出目标语言的首页。
 */
export function swapLocale(pathname: string, target: Locale): string {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0 || !isLocale(segments[0])) return `/${target}/`
  const rest = segments.slice(1).join("/")
  return rest ? `/${target}/${rest}/` : `/${target}/`
}
