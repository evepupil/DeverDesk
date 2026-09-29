"use client"

import { useSyncExternalStore } from "react"

import { DEFAULT_LOCALE, type Locale } from "./locales"
import type { Messages } from "./messages/types"
import { getLocale, messagesFor, subscribeLocale } from "./runtime"

/** 当前语言；预渲染和首次挂载时按默认语言，挂载后换成实际语言 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => DEFAULT_LOCALE)
}

/** 组件里取词条：const t = useT()，然后 t.tasks.empty */
export function useT(): Messages {
  return messagesFor(useLocale())
}
