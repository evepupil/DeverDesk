import type { Locale } from "@/i18n/locales"
import { getMessages } from "@/i18n"
import { cn } from "@/lib/cn"
import { CONTAINER, CARD, CARD_BODY, CARD_TITLE, SECTION_Y } from "@/lib/styles"
import { SectionHeading } from "@/components/site/section-heading"
import { SMALL_FEATURE_KEYS, type SmallFeatureKey } from "@/content/home"
import { IconBell, IconClockHour4, IconCommand, IconDatabaseExport, IconRepeat, IconSparkles } from "@tabler/icons-react"
import { FeaturesTodayArt } from "./features-today-art"
import { FeaturesRateArt } from "./features-rate-art"
import { FeaturesMoneyArt } from "./features-money-art"
import { FeaturesQuickAddArt } from "./features-quick-add-art"

const SMALL_FEATURE_ICONS = {
  review: IconSparkles,
  routines: IconRepeat,
  backup: IconDatabaseExport,
  search: IconCommand,
  alerts: IconBell,
  timer: IconClockHour4,
}

export function FeaturesSection({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const features = t.home.features

  return (
    <section id="features" className={cn(CONTAINER, SECTION_Y)}>
      <SectionHeading title={features.title} subtitle={features.subtitle} />

      <div className="mt-10 grid grid-cols-1 gap-4 md:mt-16 md:grid-cols-3 md:grid-rows-[minmax(340px,auto)_minmax(340px,auto)]">
        <article data-feature="today" className={cn(CARD, "flex flex-col overflow-hidden md:row-span-2")}>
          <div className="p-6">
            <h3 className={CARD_TITLE}>{features.today.title}</h3>
            <p className={cn(CARD_BODY, "max-w-sm")}>{features.today.body}</p>
          </div>
          <div aria-hidden="true" className="relative flex flex-1 flex-col justify-end px-6 pb-6">
            <FeaturesTodayArt locale={locale} />
          </div>
        </article>

        <article data-feature="rate" className={cn(CARD, "flex flex-col overflow-hidden")}>
          <div className="p-6">
            <h3 className={CARD_TITLE}>{features.rate.title}</h3>
            <p className={cn(CARD_BODY, "max-w-sm")}>{features.rate.body}</p>
          </div>
          <div aria-hidden="true" className="relative flex flex-1 flex-col justify-end px-6 pb-6">
            <FeaturesRateArt locale={locale} />
          </div>
        </article>

        <article data-feature="money" className={cn(CARD, "flex flex-col overflow-hidden md:row-span-2")}>
          <div className="p-6">
            <h3 className={CARD_TITLE}>{features.money.title}</h3>
            <p className={cn(CARD_BODY, "max-w-sm")}>{features.money.body}</p>
          </div>
          <div aria-hidden="true" className="relative flex flex-1 flex-col justify-between gap-10 px-6 pb-6">
            <FeaturesMoneyArt locale={locale} />
          </div>
        </article>

        <article data-feature="quick-add" className={cn(CARD, "flex flex-col overflow-hidden")}>
          <div className="p-6">
            <h3 className={CARD_TITLE}>{features.quickAdd.title}</h3>
            <p className={cn(CARD_BODY, "max-w-sm")}>{features.quickAdd.body}</p>
          </div>
          <div aria-hidden="true" className="relative flex flex-1 flex-col justify-end px-6 pb-6">
            <FeaturesQuickAddArt locale={locale} />
          </div>
        </article>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {SMALL_FEATURE_KEYS.map((key: SmallFeatureKey) => {
          const Icon = SMALL_FEATURE_ICONS[key]
          const item = features.small[key]

          return (
            <div key={key} data-small-feature={key} className="px-2 md:px-6">
              <Icon size={22} stroke={1.5} className="text-neutral-800" aria-hidden="true" />
              <h3 className="mt-4 text-sm font-semibold text-neutral-900">{item.title}</h3>
              <p className="mt-2 text-sm text-balance text-neutral-600">{item.body}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default FeaturesSection
