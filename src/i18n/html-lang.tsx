"use client"

import { useEffect } from "react"

import { useLocale } from "./react"

/** 页面的语言标记跟着界面语言变（读屏软件按它选发音）；放在根布局里，所有页面都生效 */
export function HtmlLang() {
  const locale = useLocale()
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return null
}
