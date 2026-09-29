"use client"

import { cn } from "cn"
import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"

import { WorkbenchMark } from "@/components/base/marks"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { focusRing } from "@/lib/styles"

/** 左上角的产品菜单：标识 + 名称，展开是常用操作 */
export function BrandMenu({ children }: { children?: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm font-medium hover:bg-hover data-[state=open]:bg-hover",
          focusRing
        )}
      >
        <WorkbenchMark />
        <span className="truncate">DeverDesk</span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
