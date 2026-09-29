import { cn } from "cn"
import type { ReactNode } from "react"

import type { LabelColor } from "@/domain/types"

/** 标签：白底 1px 边框，颜色只落在 6px 小圆点上（提炼：彩色面积很少） */
export function LabelChip({
  color,
  icon,
  children,
  className,
  title,
}: {
  color?: LabelColor
  icon?: ReactNode
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-line-2 bg-card px-1.5 text-xs text-fg-2",
        className
      )}
    >
      {color && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: `var(--label-${color})` }}
        />
      )}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

/** 档位：三根竖条，档位越高亮起越多（优先级高、中、低用它） */
export function TierIcon({ tier, className }: { tier: 1 | 2 | 3; className?: string }) {
  const bars = [
    { x: 1.5, h: 4 },
    { x: 5.5, h: 7 },
    { x: 9.5, h: 10 },
  ]
  return (
    <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden className={cn("shrink-0", className)}>
      {bars.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={12 - bar.h}
          width={3}
          height={bar.h}
          rx={0.8}
          fill={index < tier ? "var(--text-secondary)" : "var(--line-strong)"}
        />
      ))}
    </svg>
  )
}
