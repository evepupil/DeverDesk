import { IconArrowRight } from "@tabler/icons-react"
import { cn } from "@/lib/cn"
import { externalRel } from "@/lib/links"

type TextLinkProps = {
  href: string
  children: React.ReactNode
  external?: boolean
  className?: string
}

export function TextLink({ href, children, external = false, className }: TextLinkProps) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: externalRel(href) } : {})}
      className={cn("group inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900", className)}
    >
      {children}
      <IconArrowRight size={14} stroke={1.75} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </a>
  )
}
