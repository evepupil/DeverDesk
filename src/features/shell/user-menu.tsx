"use client"

import { cn } from "cn"
import type { ReactNode } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { focusRing } from "@/lib/styles"

/** 右上角头像菜单：头像和菜单项由各工作区自己给 */
export function UserMenu({
  name,
  detail,
  avatar,
  children,
}: {
  name: string
  detail?: string
  avatar: ReactNode
  children?: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`账户：${name}`}
        className={cn("ml-1 flex size-6 items-center justify-center rounded-full", focusRing)}
      >
        {avatar}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 pb-1.5">
          <span className="text-sm font-medium text-fg">{name}</span>
          {detail && <span className="truncate">{detail}</span>}
        </DropdownMenuLabel>
        {children && <DropdownMenuSeparator />}
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
