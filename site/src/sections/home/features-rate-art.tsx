import { RATE_ROW_BARS, RATE_ROW_COLORS } from "@/content/home"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"

const RATE_COLOR_CLASSES: Record<(typeof RATE_ROW_COLORS)[number], string> = {
  indigo: "bg-label-indigo",
  blue: "bg-label-blue",
  teal: "bg-label-teal",
}

const RATE_BAR_CLASSES = { maximum: "bg-brand-primary", standard: "bg-neutral-300" }

export function FeaturesRateArt({ locale }: { locale: Locale }) {
  const rows = getMessages(locale).home.features.rate.rows
  const columns = getMessages(locale).home.features.rate.columns

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 border-b border-neutral-100 px-4 py-2 text-[11px] text-neutral-500">
        <span aria-hidden="true" />
        {columns.map((column) => (
          <span key={column} className="text-right">
            {column}
          </span>
        ))}
      </div>
      {rows.map((row, index) => {
        const color = RATE_ROW_COLORS[index]
        const bar = RATE_ROW_BARS[index]
        if (!color || bar === undefined) return null

        return (
          <div key={row.name} className="px-4 py-2.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 text-[13px]">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-[3px]", RATE_COLOR_CLASSES[color])} aria-hidden="true" />
                <span className="truncate text-neutral-800">{row.name}</span>
              </div>
              <span className="text-right tabular-nums text-neutral-700">{row.net}</span>
              <span className="text-right tabular-nums text-neutral-500">{row.hours}</span>
              <span className="text-right font-semibold tabular-nums text-neutral-900">{row.rate}</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-neutral-100">
              <div
                className={cn("h-full rounded-full", bar === 1 ? RATE_BAR_CLASSES.maximum : RATE_BAR_CLASSES.standard)}
                style={{ width: `${bar * 100}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default FeaturesRateArt
