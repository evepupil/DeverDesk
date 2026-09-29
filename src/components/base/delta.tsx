import { cn } from "cn"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { formatPointDelta, formatSignedPercent } from "@/domain/format"

/**
 * 涨跌：箭头 + 数字，好坏由指标方向决定（流失率下降才是好事）。
 * 只用在 12px 文字上，保持彩色面积很小。
 */
export function Delta({
  value,
  kind = "ratio",
  goodWhen = "up",
  className,
}: {
  value: number | null
  kind?: "ratio" | "points"
  goodWhen?: "up" | "down"
  className?: string
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={cn("text-xs text-fg-2", className)}>—</span>
  }
  const flat = Math.abs(value) < 0.0005
  const good = goodWhen === "up" ? value > 0 : value < 0
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  const text = kind === "ratio" ? formatSignedPercent(value) : formatPointDelta(value)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs tabular",
        flat ? "text-fg-2" : good ? "text-good" : "text-bad",
        className
      )}
    >
      {!flat && <Icon className="size-3.5" aria-hidden />}
      {text}
    </span>
  )
}
