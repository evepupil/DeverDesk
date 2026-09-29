import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-md border border-line-2 bg-card px-2 py-1.5 text-base transition-colors outline-none placeholder:text-fg-3 hover:border-line-3 focus-visible:border-(--focus-ring) focus-visible:ring-3 focus-visible:ring-black/[0.05] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-bad aria-invalid:ring-3 aria-invalid:ring-bad/10 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
