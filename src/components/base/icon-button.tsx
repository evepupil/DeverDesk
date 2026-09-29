"use client"

import { cn } from "cn"
import type { ComponentProps, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** 只有图标的按钮：必须带文字说明（读屏 + 悬停提示），可附快捷键 */
export function IconButton({
  label,
  shortcut,
  children,
  className,
  size = "icon-sm",
  ...props
}: {
  label: string
  shortcut?: ReactNode
  children: ReactNode
  size?: "icon-xs" | "icon-sm" | "icon"
} & Omit<ComponentProps<typeof Button>, "size">) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size={size} aria-label={label} className={cn("text-fg-2", className)} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}
