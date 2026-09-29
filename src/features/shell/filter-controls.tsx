"use client"

import { ListFilter, X, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Filters } from "@/domain/filters"
import { useT } from "@/i18n/react"

export interface FilterOption {
  value: string
  label: string
  icon?: ReactNode
}

export interface FilterField {
  key: string
  label: string
  icon: LucideIcon
  options: FilterOption[]
  /** 在其余条件都生效时，每个选项还能命中多少条 */
  counts?: Map<string, number>
}

function OptionItems({
  field,
  selected,
  onToggle,
}: {
  field: FilterField
  selected: string[]
  onToggle(key: string, value: string): void
}) {
  return field.options.map((option) => (
    <DropdownMenuCheckboxItem
      key={option.value}
      checked={selected.includes(option.value)}
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={() => onToggle(field.key, option.value)}
    >
      {option.icon}
      <span className="truncate">{option.label}</span>
      {field.counts && (
        <span className="ml-auto pl-3 text-xs text-fg-2 tabular">{field.counts.get(option.value) ?? 0}</span>
      )}
    </DropdownMenuCheckboxItem>
  ))
}

/** 「筛选」菜单：先选字段，再勾选取值；菜单不关，可以连续勾选（提炼补全：筛选菜单） */
export function FilterMenu({
  fields,
  filters,
  onToggle,
}: {
  fields: FilterField[]
  filters: Filters
  onToggle(key: string, value: string): void
}) {
  const t = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0">
          <ListFilter />
          {t.frame.filter.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {fields.map((field) => {
          const selected = filters[field.key] ?? []
          return (
            <DropdownMenuSub key={field.key}>
              <DropdownMenuSubTrigger>
                <field.icon className="text-fg-2" />
                <span>{field.label}</span>
                {selected.length > 0 && (
                  <span className="ml-auto text-xs text-fg-2 tabular">{selected.length}</span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="scroll-thin max-h-80 w-56 overflow-y-auto">
                <OptionItems field={field} selected={selected} onToggle={onToggle} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 生效中的条件：字段 | 取值 | 清除，点取值可以改 */
export function FilterChips({
  fields,
  filters,
  onToggle,
  onClear,
  onClearAll,
}: {
  fields: FilterField[]
  filters: Filters
  onToggle(key: string, value: string): void
  onClear(key: string): void
  onClearAll(): void
}) {
  const t = useT()
  const active = fields.filter((field) => (filters[field.key] ?? []).length > 0)
  if (active.length === 0) return null

  return (
    <>
      {active.map((field) => {
        const selected = filters[field.key] ?? []
        const labels = field.options.filter((option) => selected.includes(option.value)).map((option) => option.label)
        return (
          <div
            key={field.key}
            className="flex h-6 shrink-0 items-center overflow-hidden rounded-md border border-line-2 bg-card text-xs shadow-xs"
          >
            <span className="flex items-center gap-1 px-1.5 text-fg-2">
              <field.icon className="size-3.5" aria-hidden />
              {field.label}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="h-full max-w-44 truncate border-l border-line px-1.5 text-fg outline-none hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring) data-[state=open]:bg-hover">
                {labels.length > 2 ? t.frame.filter.count(labels.length) : labels.join(t.frame.filter.joiner)}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="scroll-thin max-h-80 w-56 overflow-y-auto">
                <DropdownMenuLabel>{field.label}</DropdownMenuLabel>
                <OptionItems field={field} selected={selected} onToggle={onToggle} />
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              aria-label={t.frame.filter.clearAria(field.label)}
              onClick={() => onClear(field.key)}
              className="flex h-full items-center border-l border-line px-1 text-fg-3 outline-none hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onClearAll}>
        {t.frame.filter.clear}
      </Button>
    </>
  )
}
