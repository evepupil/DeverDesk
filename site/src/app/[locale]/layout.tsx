import "../globals.css"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getMessages } from "@/i18n"
import { HTML_LANG, LOCALES, isLocale } from "@/i18n/locales"
import { pageMetadata } from "@/lib/metadata"

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  const t = getMessages(localeValue)
  return pageMetadata({ locale: localeValue, path: "/", title: t.meta.home.title, description: t.meta.home.description })
}

export default async function LocaleLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  return (
    <html lang={HTML_LANG[localeValue]}>
      <body className="bg-white font-sans text-neutral-700 antialiased">{children}</body>
    </html>
  )
}
