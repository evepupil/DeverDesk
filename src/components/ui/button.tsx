import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/**
 * 按钮：控件圆角 5px、13px 文字（提炼）。工作区里常用 sm（24px）和 default（28px）。
 * 主按钮用中性深色，彩色只留给状态识别。
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors duration-(--dur-fast) outline-none select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring) disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88 active:bg-primary/80",
        outline:
          "border-line-2 bg-card text-fg shadow-xs hover:border-line-3 hover:bg-raised active:bg-column aria-expanded:bg-raised",
        secondary: "bg-secondary text-fg hover:bg-pressed",
        ghost:
          "text-fg-2 hover:bg-hover hover:text-fg active:bg-pressed aria-expanded:bg-hover aria-expanded:text-fg",
        destructive: "bg-bad text-white hover:bg-bad/90 active:bg-bad/85",
        link: "text-fg underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-2.5",
        xs: "h-5 gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-8 px-3",
        icon: "size-7",
        "icon-xs": "size-5 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
