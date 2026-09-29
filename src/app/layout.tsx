import "@fontsource-variable/inter"
import "./globals.css"

import type { Metadata, Viewport } from "next"
import { Suspense } from "react"

import { Analytics } from "@/features/edition/analytics"
import { ShellSkeleton } from "@/features/shell/shell-skeleton"

export const metadata: Metadata = {
  title: { default: "DeverDesk", template: "%s · DeverDesk" },
  description: "独立开发者的一人公司控制台：任务、时间和副业收支放在一起，算出每个副业每小时赚多少。",
}

export const viewport: Viewport = {
  themeColor: "#f2f2f3",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 筛选条件存在地址栏里，外框要在浏览器里读参数，这里给出加载骨架 */}
        <Suspense fallback={<ShellSkeleton />}>{children}</Suspense>
        <Analytics />
      </body>
    </html>
  )
}
