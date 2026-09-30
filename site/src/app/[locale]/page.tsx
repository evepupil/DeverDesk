import { notFound } from "next/navigation"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { getMessages } from "@/i18n"
import { isLocale } from "@/i18n/locales"
import { pageMetadata } from "@/lib/metadata"
import CtaSection from "@/sections/home/cta-section"
import EditionsSection from "@/sections/home/editions-section"
import FaqSection from "@/sections/home/faq-section"
import FeaturesSection from "@/sections/home/features-section"
import HeroSection from "@/sections/home/hero-section"
import OpenSourceSection from "@/sections/home/open-source-section"
import ScenariosSection from "@/sections/home/scenarios-section"
import TechStripSection from "@/sections/home/tech-strip-section"
import TourSection from "@/sections/home/tour-section"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  const t = getMessages(localeValue)
  return pageMetadata({ locale: localeValue, path: "/", title: t.meta.home.title, description: t.meta.home.description })
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  const locale = localeValue

  return (
    <>
      <SiteHeader locale={locale} current="home" />
      <main id="main">
        <HeroSection locale={locale} />
        <TechStripSection locale={locale} />
        <FeaturesSection locale={locale} />
        <TourSection locale={locale} />
        <EditionsSection locale={locale} />
        <OpenSourceSection locale={locale} />
        <ScenariosSection locale={locale} />
        <FaqSection locale={locale} />
        <CtaSection locale={locale} />
      </main>
      <SiteFooter locale={locale} editPath="site/src/app/[locale]/page.tsx" />
    </>
  )
}
