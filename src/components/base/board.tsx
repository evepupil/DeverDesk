import { cn } from "cn"
import { ChevronRight } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

/**
 * 看板列：比面板略深的底色，里面放白色卡片，卡片间隔 8px（提炼）。
 * 概览和客户看板共用这一种列，保证两处看起来是同一套东西。
 */
export function BoardColumn({
  icon,
  title,
  count,
  meta,
  actions,
  children,
  className,
  bodyClassName,
  headingLevel = 2,
}: {
  icon?: ReactNode
  title: string
  count?: number | string
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg bg-column", className)}>
      <header className="flex h-9 shrink-0 items-center gap-2 pr-1.5 pl-3">
        {icon}
        <Heading className="truncate text-sm font-medium">{title}</Heading>
        {count !== undefined && <span className="text-sm text-fg-2 tabular">{count}</span>}
        {meta && <span className="min-w-0 truncate text-xs text-fg-2">{meta}</span>}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-0.5">{actions}</div>}
      </header>
      <div className={cn("flex min-h-0 flex-col gap-(--gap-card) px-1 pb-1", bodyClassName)}>{children}</div>
    </section>
  )
}

/** 收起的分组：一整行短条，点开看内容（提炼：已结束的状态收成一组短行） */
export function CollapsedRow({
  icon,
  label,
  count,
  meta,
  className,
  ...props
}: {
  icon?: ReactNode
  label: string
  count?: number | string
  meta?: ReactNode
} & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "group flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-(--dur-fast) hover:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring) aria-expanded:bg-hover",
        className
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 text-fg-2 tabular">{count}</span>}
      {meta && <span className="ml-auto shrink-0 text-xs text-fg-2 tabular">{meta}</span>}
      <ChevronRight className={cn("size-3.5 shrink-0 text-fg-3", !meta && "ml-auto")} aria-hidden />
    </button>
  )
}

/** 白色卡片面：1px 低对比边框 + 很浅的阴影 */
export function Surface({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-card shadow-sm", className)} {...props} />
}

export function CardHeading({
  title,
  aside,
  className,
}: {
  title: string
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-5 items-center justify-between gap-2", className)}>
      <h3 className="truncate text-sm font-medium">{title}</h3>
      {aside && <div className="shrink-0 text-xs text-fg-2 tabular">{aside}</div>}
    </div>
  )
}
