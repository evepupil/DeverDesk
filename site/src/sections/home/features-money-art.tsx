import { IconAlertTriangle, IconCircleCheck, IconHourglass } from "@tabler/icons-react"
import { GOAL_PROGRESS, MONEY_ITEM_TONES, WEEKLY_NET_BARS } from "@/content/home"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"

const MONEY_TONE_CLASSES: Record<(typeof MONEY_ITEM_TONES)[number], string> = {
  pending: "bg-dd-progress/15 text-dd-warn",
  received: "bg-dd-good/10 text-dd-good",
  late: "bg-dd-risk/10 text-dd-risk",
}

export function FeaturesMoneyArt({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const money = t.home.features.money

  return (
    <div className="flex flex-1 flex-col justify-between gap-10">
      <ul className="space-y-4">
        {MONEY_ITEM_TONES.map((tone, index) => {
          const item = money.items[index]
          if (!item) return null
          const Icon = tone === "pending" ? IconHourglass : tone === "received" ? IconCircleCheck : IconAlertTriangle

          return (
            <li key={tone} className={cn("flex items-center gap-3", index === 1 && "flex-row-reverse")}>
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", MONEY_TONE_CLASSES[tone])}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="relative min-w-0 max-w-full break-words rounded-2xl bg-white px-4 py-2.5 text-[13px] text-neutral-700 shadow-sm ring-1 ring-black/5">
                <span className="font-medium text-neutral-900">{item.project}</span>
                <span className="mx-1.5 text-neutral-300">·</span>
                {item.text}
                {tone === "late" ? (
                  <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-dd-risk">
                    <span className="absolute inset-0 animate-ping rounded-full bg-dd-risk/50 motion-reduce:hidden" />
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="relative isolate mt-8">
        <div aria-hidden="true" className="absolute -z-10 inset-x-0 top-1/2 border-t border-dashed border-neutral-200" />
        <div aria-hidden="true" className="absolute -z-10 -top-16 -bottom-6 left-1/2 border-l border-dashed border-neutral-200" />
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center gap-4">
            <div className="relative flex size-16 shrink-0 items-center justify-center">
              <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
                <circle cx="32" cy="32" r="26" fill="none" strokeWidth="6" className="stroke-neutral-100" />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={163.4}
                  strokeDashoffset={163.4 * (1 - GOAL_PROGRESS)}
                  className="stroke-brand-primary"
                />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-[13px] font-semibold tabular-nums text-neutral-900">
                {money.goalPercent}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">{money.goalLabel}</p>
              <p className="text-xl font-semibold tabular-nums text-neutral-900">{money.goalValue}</p>
              <p className="text-xs text-neutral-500">{money.goalTarget}</p>
            </div>
          </div>
          <div className="mt-4 flex h-14 items-end gap-1.5 border-t border-neutral-100 pt-3">
            {WEEKLY_NET_BARS.map((value, index) => (
              <span
                key={index}
                className={cn("flex-1 rounded-t-sm", index === WEEKLY_NET_BARS.length - 1 ? "bg-brand-primary" : "bg-neutral-200")}
                style={{ height: `${value * 100}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FeaturesMoneyArt
