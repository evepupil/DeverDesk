"use client"

import { cn } from "cn"
import Link from "next/link"
import type { ReactNode } from "react"

import { focusRingInset } from "@/lib/styles"

/** 侧栏的一行：只有当前入口加一整行浅灰底，不加粗（提炼） */
export function NavRow({
  href,
  icon,
  label,
  count,
  active,
  indent,
  onNavigate,
}: {
  href: string
  icon: ReactNode
  label: string
  count?: number | string
  active: boolean
  indent?: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-sm text-fg transition-colors duration-(--dur-fast) hover:bg-hover",
        focusRingInset,
        active && "bg-selected hover:bg-selected",
        indent && "pl-7"
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-fg-2">{icon}</span>
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="ml-auto text-xs text-fg-2 tabular">{count}</span>}
    </Link>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pt-4 pb-1">
      <span className="text-xs font-medium text-fg-2">{children}</span>
      {action}
    </div>
  )
}
