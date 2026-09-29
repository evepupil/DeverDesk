"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, CircleXIcon, Loader2Icon } from "lucide-react"

/** 轻提示：白底、1px 边框、浅阴影，图标承担颜色 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-done" />,
        info: <InfoIcon className="size-4 text-fg-2" />,
        warning: <TriangleAlertIcon className="size-4 text-progress" />,
        error: <CircleXIcon className="size-4 text-bad" />,
        loading: <Loader2Icon className="size-4 animate-spin text-fg-2" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--line-default)",
          "--border-radius": "var(--radius-lg)",
          "--width": "340px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!gap-2 !px-3 !py-2.5 !text-sm !shadow-md",
          title: "!text-sm !font-medium",
          description: "!text-xs !text-fg-2",
          actionButton: "!h-6 !rounded-md !bg-primary !px-2 !text-xs !font-medium",
          cancelButton: "!h-6 !rounded-md !px-2 !text-xs",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
