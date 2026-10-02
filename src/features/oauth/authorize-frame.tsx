import type { ReactNode } from "react"

import { WorkbenchMark } from "@/components/base/marks"

/** 授权页的外框：和登录页同一张居中白卡，各个状态都放在里面，切换时版面不跳 */
export function AuthorizeFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-window px-4 py-8">
      <div className="w-full max-w-[380px] rounded-lg border border-line-2 bg-card p-6 shadow-md">
        <div className="mb-5 flex items-center justify-center gap-2">
          <WorkbenchMark size={20} />
          <span className="font-heading text-sm font-medium">DeverDesk</span>
        </div>
        {children}
      </div>
    </main>
  )
}
