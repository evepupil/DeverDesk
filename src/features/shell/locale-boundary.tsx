"use client"

import { Fragment, type ReactNode } from "react"

import { profileCurrency } from "@/domain/format"
import { useLocale } from "@/i18n/react"
import { setCurrency } from "@/i18n/runtime"
import { useWorkbench } from "@/state/store"

/**
 * 语言和记账币种的边界：两者任一变化时，里面的内容换一个 key 整个重画，
 * 这样按当前语言出文字的计算函数（日期、金额、状态叫法）也跟着换，不用各自订阅。
 * 页面的语言标记由根布局里的 HtmlLang 负责。
 */
export function LocaleBoundary({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const currency = useWorkbench((state) => profileCurrency(state.profile))
  // 金额格式化在子组件渲染时读取币种，必须在渲染子组件之前设好；重复设置同一个值没有副作用
  setCurrency(currency)

  return <Fragment key={`${locale}|${currency}`}>{children}</Fragment>
}
