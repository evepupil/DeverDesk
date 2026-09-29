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

/** GitHub 标识（octicons 的 mark-github，MIT 许可） */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden className={className}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
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
