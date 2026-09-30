import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { getRepoStats } from "@/content/github"
import { SiteNavbar } from "./site-navbar"

export type NavKey = "home" | "changelog" | "blog"

export async function SiteHeader({ locale, current }: { locale: Locale; current: NavKey }) {
  const t = getMessages(locale)
  const stats = await getRepoStats()

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        {t.common.skipToContent}
      </a>
      <SiteNavbar locale={locale} current={current} stars={stats.stars} />
    </>
  )
}
