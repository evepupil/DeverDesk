import { cn } from "cn"

import { formatMinutes } from "@/domain/format"

/**
 * 容量条：排了多少 / 能用多少。超出的部分用进行中黄色接在后面，
 * 颜色之外再配一句「超出 45m」，不只靠颜色表达。
 */
export function CapacityBar({
  planned,
  capacity,
  done = 0,
  className,
  showLabel = true,
}: {
  planned: number
  capacity: number
  done?: number
  className?: string
  showLabel?: boolean
}) {
  const scale = Math.max(planned, capacity, 1)
  const within = Math.min(planned, capacity)
  const over = Math.max(0, planned - capacity)
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        role="meter"
        aria-label="当天已排时长"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={planned}
        className="relative h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-pressed/70"
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-(--tier-1)" style={{ width: `${(within / scale) * 100}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${(Math.min(done, within) / scale) * 100}%` }} />
        {over > 0 && (
          <span
            className="absolute inset-y-0 rounded-r-full bg-progress"
            style={{ left: `${(capacity / scale) * 100}%`, width: `${(over / scale) * 100}%` }}
          />
        )}
      </div>
      {showLabel && (
        <span className="shrink-0 text-xs whitespace-nowrap text-fg-2 tabular">
          {formatMinutes(planned)} / {formatMinutes(capacity)}
          {over > 0 && <span className="ml-1.5 text-warn">超出 {formatMinutes(over)}</span>}
        </span>
      )}
    </div>
  )
}
