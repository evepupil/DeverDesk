"use client"

import { cn } from "cn"

/** 分段选择：几个互斥选项，选中项用白底浮起，其余透明 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange(value: T): void
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex h-6 shrink-0 items-center rounded-md bg-pressed/70 p-0.5", className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-5 rounded-[4px] px-2 text-xs whitespace-nowrap transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)",
              selected ? "bg-card text-fg shadow-xs" : "text-fg-2 hover:text-fg"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
