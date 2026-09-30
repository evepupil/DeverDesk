"use client"

import { usePathname } from "next/navigation"
import { IconLanguage } from "@tabler/icons-react"
import { getMessages } from "@/i18n"
import { HTML_LANG, LOCALE_NAMES, LOCALE_SHORT, LOCALES, LOCALE_STORAGE_KEY, swapLocale, type Locale } from "@/i18n/locales"

export function LocaleSwitch({ locale, variant = "inline" }: { locale: Locale; variant?: "inline" | "menu" }) {
  const pathname = usePathname()
  const t = getMessages(locale)

  return (
    <div
      role="group"
      aria-label={t.nav.language}
      className={variant === "inline" ? "inline-flex h-9 items-center rounded-md p-0.5 ring-1 ring-neutral-200" : "flex items-center gap-2"}
    >
      {variant === "menu" ? <IconLanguage size={18} stroke={1.75} className="text-neutral-400" aria-hidden /> : null}
      {LOCALES.map((target) => {
        const selected = target === locale
        const className =
          variant === "inline"
            ? selected
              ? "rounded-sm bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-900"
              : "rounded-sm px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900"
            : selected
              ? "rounded-full bg-neutral-900 px-3 py-1.5 text-sm text-white"
              : "rounded-full px-3 py-1.5 text-sm text-neutral-600 ring-1 ring-neutral-200 hover:text-neutral-900"

        return (
          <a
            key={target}
            href={swapLocale(pathname ?? "/", target)}
            lang={HTML_LANG[target]}
            hrefLang={HTML_LANG[target]}
            data-locale={target}
            aria-current={selected ? "true" : undefined}
            className={className}
            onClick={() => {
              try {
                localStorage.setItem(LOCALE_STORAGE_KEY, target)
              } catch {}
            }}
          >
            {variant === "inline" ? LOCALE_SHORT[target] : LOCALE_NAMES[target]}
          </a>
        )
      })}
    </div>
  )
}
