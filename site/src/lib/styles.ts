/**
 * 全站共用的类名：按钮、容器、标题、卡片。这个文件不带 "use client"，服务端组件和客户端组件都能直接用。
 * 按钮的变体用对象映射完整类名，Tailwind 只认完整类名，不要拼接。
 */
import { cn } from "./cn"

export const CONTAINER = "mx-auto w-full max-w-7xl px-4 md:px-8"
export const SECTION_Y = "py-10 md:py-20 lg:py-32"
/** 区块标题：中文只在标点和空格处换行（break-keep），不会把一个词拆到两行 */
export const SECTION_TITLE = "text-2xl tracking-tight text-balance break-keep text-neutral-700 md:text-4xl lg:text-5xl"
export const SECTION_SUBTITLE = "mt-2 text-sm text-neutral-600 md:text-base lg:text-lg"
export const CARD = "rounded-2xl bg-white shadow-sm ring-1 shadow-black/10 ring-black/10"
export const CARD_SOFT = "rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
export const CARD_FLOAT = "rounded-xl bg-white p-5 shadow-lg ring-1 ring-black/5"
export const CARD_TITLE = "text-sm font-semibold text-neutral-900"
export const CARD_BODY = "mt-2 text-sm text-balance text-neutral-600"
export const NAV_LINK = "text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
export const BROWSER_FRAME = "overflow-hidden rounded-xl border border-neutral-300/50 bg-white/70 backdrop-blur-sm"

export type ButtonVariant = "primary" | "secondary" | "ghost"
export type ButtonSize = "sm" | "md"

const BUTTON_BASE =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-all duration-200 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-b from-brand-secondary to-brand-primary text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.1)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_14px_rgba(30,144,255,0.35)]",
  secondary:
    "bg-white text-neutral-700 ring-1 ring-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-neutral-50 hover:ring-neutral-300",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-12 px-6 text-base",
}

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string): string {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], extra)
}
