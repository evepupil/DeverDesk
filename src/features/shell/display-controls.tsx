"use client"

import { cn } from "cn"
import { SlidersHorizontal } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/i18n/react"

/** 「显示」设置：只改怎么看，不改数据（提炼补全：显示设置） */
export function DisplayPopover({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  const t = useT()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <SlidersHorizontal />
          {t.frame.display.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] gap-0 p-0">
        <div className="flex flex-col py-1">{children}</div>
        {onReset && (
          <div className="flex justify-end border-t border-line px-2 py-1.5">
            <Button variant="ghost" size="sm" onClick={onReset}>
              {t.frame.display.reset}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function DisplayRow({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 px-3">
      <label htmlFor={id} className="text-sm text-fg-2">
        {label}
      </label>
      {children}
    </div>
  )
}

export function DisplaySelect<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string
  value: T
  options: { value: T; label: string }[]
  onChange(value: T): void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} size="sm" className="h-6 min-w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function DisplaySwitch({
  id,
  checked,
  onChange,
}: {
  id: string
  checked: boolean
  onChange(checked: boolean): void
}) {
  return <Switch id={id} checked={checked} onCheckedChange={onChange} />
}

export function DisplayDivider() {
  return <div className="my-1 h-px bg-line" />
}

/** 属性开关：一组可按下的小标签 */
export function PropertyToggles<T extends string>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: { value: T; label: string }[]
  selected: T[]
  onToggle(value: T): void
}) {
  return (
    <div className="px-3 pt-1 pb-2">
      <div className="pb-2 text-sm text-fg-2">{title}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const pressed = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(option.value)}
              className={cn(
                "h-6 rounded-md border px-2 text-xs transition-colors duration-(--dur-fast) outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)",
                pressed
                  ? "border-transparent bg-selected text-fg"
                  : "border-line-2 text-fg-2 hover:bg-hover hover:text-fg"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
