import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"

export function NewTabHint({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  return <span className="sr-only">{t.common.newTab}</span>
}
