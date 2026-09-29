import { DEFAULT_CURRENCY, DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from "./locales"
import { en } from "./messages/en"
import type { Messages } from "./messages/types"
import { zhCN } from "./messages/zh-CN"

/**
 * 当前语言和当前记账币种。
 * 组件用 react.ts 的 useT() 取词条；计算函数（日期、金额、提醒文字）用这里的 getT()、getLocale()、getCurrency()。
 * 切换语言时工作台整个重画（见 features/shell/locale-boundary.tsx），所以计算函数不需要订阅。
 */

const KEY = "deverdesk:locale"

const CATALOG: Record<Locale, Messages> = { "zh-CN": zhCN, en }

const listeners = new Set<() => void>()

/** 只用到浏览器的这几样；Worker 后端也会引用本文件（经由计算层），那里没有它们 */
interface BrowserGlobals {
  document?: unknown
  localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void }
  navigator?: { languages?: readonly string[]; language?: string }
}

const browser = globalThis as BrowserGlobals

function initialLocale(): Locale {
  if (browser.document === undefined) return DEFAULT_LOCALE
  try {
    const stored = browser.localStorage?.getItem(KEY)
    if (isLocale(stored)) return stored
  } catch {
    // 读不了本机存储就按浏览器语言
  }
  const languages = browser.navigator?.languages?.length ? browser.navigator.languages : [browser.navigator?.language ?? ""]
  return detectLocale(languages.filter(Boolean))
}

let locale: Locale = initialLocale()
let currency = DEFAULT_CURRENCY

export function getLocale(): Locale {
  return locale
}

export function messagesFor(target: Locale): Messages {
  return CATALOG[target]
}

/** 当前语言的词条，给不是组件的代码用 */
export function getT(): Messages {
  return CATALOG[locale]
}

/** 切换语言：记在本机，通知订阅者 */
export function setLocale(next: Locale) {
  if (next === locale) return
  locale = next
  try {
    browser.localStorage?.setItem(KEY, next)
  } catch {
    // 存不上只影响下次打开
  }
  for (const listener of listeners) listener()
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCurrency(): string {
  return currency
}

/** 由工作台外层按个人设置里的币种设置 */
export function setCurrency(next: string) {
  currency = next
}
