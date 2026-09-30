import { cn } from "@/lib/cn"
import { BROWSER_FRAME } from "@/lib/styles"

type BrowserFrameProps = {
  url?: string
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

export function BrowserFrame({ url, children, className, bodyClassName }: BrowserFrameProps) {
  return (
    <div className={cn(BROWSER_FRAME, className)}>
      <div className="relative flex h-10 items-center border-b border-neutral-200/70 bg-white/60 px-4">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        {url ? <span className="absolute left-1/2 -translate-x-1/2 truncate text-xs text-neutral-500">{url}</span> : null}
      </div>
      <div className={cn("relative", bodyClassName)}>{children}</div>
    </div>
  )
}
