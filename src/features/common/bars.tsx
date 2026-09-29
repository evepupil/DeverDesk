import { cn } from "cn"

/**
 * 小柱状图：中性灰阶，负数用更浅的灰画在基线下面（提炼：图表不靠颜色）。
 * 最后一根是还没过完的这一期，用深色标出来。
 */
export function MiniBars({ values, height = 16, className }: { values: number[]; height?: number; className?: string }) {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)))
  const signed = values.some((value) => value < 0)
  const span = signed ? height / 2 : height
  return (
    <svg
      viewBox={`0 0 ${values.length * 4 - 1} ${height}`}
      width={values.length * 4 - 1}
      height={height}
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {values.map((value, i) => {
        const h = Math.max(1, (Math.abs(value) / max) * span)
        const y = signed ? (value >= 0 ? height / 2 - h : height / 2) : height - h
        const last = i === values.length - 1
        return (
          <rect
            key={i}
            x={i * 4}
            y={y}
            width={3}
            height={h}
            rx={0.6}
            fill={value < 0 ? "var(--chart-negative)" : last ? "var(--chart-ink)" : "var(--tier-1)"}
          />
        )
      })}
    </svg>
  )
}

export interface BarDatum {
  key: string
  label: string
  value: number
  /** 悬停时显示的完整说明 */
  title: string
}

/** 带坐标标签的柱状图：详情侧栏里看最近几周的走势 */
export function LabeledBars({ data, height = 96, className }: { data: BarDatum[]; height?: number; className?: string }) {
  const max = Math.max(1, ...data.map((item) => Math.abs(item.value)))
  const signed = data.some((item) => item.value < 0)
  const span = signed ? height / 2 : height
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="relative flex items-stretch gap-1" style={{ height }}>
        {signed && <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-line-2" />}
        {data.map((item, i) => {
          const h = Math.max(1, (Math.abs(item.value) / max) * span)
          const last = i === data.length - 1
          return (
            <div key={item.key} title={item.title} className="group relative flex-1">
              <span
                className={cn(
                  "absolute inset-x-0 rounded-[2px] transition-opacity group-hover:opacity-80",
                  item.value < 0 ? "bg-(--chart-negative)" : last ? "bg-ink" : "bg-(--tier-1)"
                )}
                style={
                  signed
                    ? item.value >= 0
                      ? { bottom: "50%", height: h }
                      : { top: "50%", height: h }
                    : { bottom: 0, height: h }
                }
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1">
        {data.map((item, i) => (
          <span key={item.key} className="flex-1 text-center text-xs text-fg-2 tabular">
            {i % 3 === 0 || i === data.length - 1 ? item.label : ""}
          </span>
        ))}
      </div>
    </div>
  )
}
