import type { Locale } from "./locales"
import { en } from "./messages/en"
import { zh, type Messages } from "./messages/zh"

/**
 * 取词条：组件里 const t = getMessages(locale)，然后 t.home.hero.title。
 * 两种语言的词条都是普通对象（没有函数），服务端组件可以直接把其中一段传给客户端组件。
 */

const DICTIONARIES: Record<Locale, Messages> = { zh, en }

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale]
}

/** 把词条里的 {name} 占位换成值：fill("{n} 个版本", { n: 5 }) → "5 个版本"；没给的占位原样保留 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole))
}

export type { Messages }
