import { cn } from "@/lib/cn"
import { SECTION_SUBTITLE, SECTION_TITLE } from "@/lib/styles"

type SectionHeadingProps = {
  title: string
  subtitle?: string
  align?: "left" | "center"
  as?: "h1" | "h2"
  id?: string
  className?: string
  children?: React.ReactNode
}

export function SectionHeading({
  title,
  subtitle,
  align = "left",
  as = "h2",
  id,
  className,
  children,
}: SectionHeadingProps) {
  const Tag = as

  return (
    <div className={cn(align === "center" && "mx-auto max-w-2xl text-center", className)}>
      <Tag id={id} className={SECTION_TITLE}>{title}</Tag>
      {subtitle ? <p className={SECTION_SUBTITLE}>{subtitle}</p> : null}
      {children}
    </div>
  )
}
