import { cn } from "cn"

/** 产品标识：一圈表盘，右上切出一格时间 */
export function WorkbenchMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[5px] bg-fg", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 20 20" width={size * 0.7} height={size * 0.7} fill="none">
        <circle cx="10" cy="10" r="6.5" stroke="#fff" strokeWidth="1.8" />
        <path d="M10 10V3.5A6.5 6.5 0 0 1 16.5 10Z" fill="#fff" />
      </svg>
    </span>
  )
}

/** 项目标识：项目色小方块 + 名字首字 */
export function ProjectMark({
  name,
  color,
  size = 16,
  className,
}: {
  name: string
  color: string
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[4px] font-medium text-white", className)}
      style={{
        width: size,
        height: size,
        background: `var(--label-${color})`,
        fontSize: Math.max(9, Math.round(size * 0.6)),
        lineHeight: 1,
      }}
    >
      {name.slice(0, 1)}
    </span>
  )
}

/** 标签色点 */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: `var(--label-${color})` }}
    />
  )
}
