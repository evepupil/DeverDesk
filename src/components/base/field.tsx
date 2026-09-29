import { cn } from "cn"
import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"

/** 表单项：标签 + 控件 + 就地错误提示 */
export function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  )
}
