import { notFound } from "next/navigation"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { getMessages } from "@/i18n"
import { isLocale } from "@/i18n/locales"
import { pageMetadata } from "@/lib/metadata"
import ChangelogHeader from "@/sections/changelog/changelog-header"
import ChangelogSubscribe from "@/sections/changelog/changelog-subscribe"
import ChangelogTimeline from "@/sections/changelog/changelog-timeline"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  const t = getMessages(localeValue)
  return pageMetadata({ locale: localeValue, path: "/changelog/", title: t.meta.changelog.title, description: t.meta.changelog.description })
}

export default async function ChangelogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  const locale = localeValue

  return (
    <>
      <SiteHeader locale={locale} current="changelog" />
      <main id="main">
        <ChangelogHeader locale={locale} />
        <ChangelogTimeline locale={locale} />
        <ChangelogSubscribe locale={locale} />
      </main>
      <SiteFooter locale={locale} editPath="site/src/content/changelog.ts" />
    </>
  )
}
