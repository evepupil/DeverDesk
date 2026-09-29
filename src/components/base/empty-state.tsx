import { cn } from "cn"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/** 空态 / 错误态的统一画法：一枚细线图标、一句话、至多一个动作 */
export function EmptyState({
  icon: Icon,
  title,
  action,
  tone = "neutral",
  className,
}: {
  icon?: LucideIcon
  title: string
  action?: ReactNode
  tone?: "neutral" | "error"
  className?: string
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn("flex flex-col items-center justify-center gap-2 px-4 py-8 text-center", className)}
    >
      {Icon && <Icon className={cn("size-5", tone === "error" ? "text-bad" : "text-fg-3")} aria-hidden />}
      <p className="max-w-64 text-sm text-fg-2">{title}</p>
      {action}
    </div>
  )
}
