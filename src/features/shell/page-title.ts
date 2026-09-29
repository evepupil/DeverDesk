"use client"

import { useEffect } from "react"

import { useLocale } from "@/i18n/react"
import { WORKBENCH_PAGES } from "./nav"

const PRODUCT = "DeverDesk"

/**
 * 浏览器标签页标题：「页面名 · DeverDesk」，跟着当前页面和语言变。
 * 静态导出时不知道用户语言，所以标题不写在各页的静态信息里，挂载后在这里设置。
 */
export function usePageTitle(pathname: string) {
  const locale = useLocale()
  useEffect(() => {
    const page = WORKBENCH_PAGES.find((item) => (item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)))
    document.title = page ? `${page.label} · ${PRODUCT}` : PRODUCT
  }, [pathname, locale])
}
