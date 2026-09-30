import { IconArrowRight } from "@tabler/icons-react"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { NewTabHint } from "@/components/site/external-mark"
import { Screenshot } from "@/components/site/screenshot"
import { TextLink } from "@/components/site/text-link"
import { CTA_COLLAGE } from "@/content/home"
import { APP_URL, DEPLOY_URL, REPO_URL } from "@/content/site"
import { cn } from "@/lib/cn"
import { buttonClass, CONTAINER } from "@/lib/styles"
import { externalRel } from "@/lib/links"

export function CtaSection({ locale }: { locale: Locale }) {
  const t = getMessages(locale)

  return (
    <section
      id="get-started"
      className={cn(CONTAINER, "grid grid-cols-1 items-center gap-10 py-16 md:grid-cols-2 md:gap-16 md:py-24")}
    >
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-balance break-keep text-black md:text-4xl lg:text-5xl">{t.home.cta.title}</h2>
        <p className="mt-6 max-w-lg text-base text-neutral-600 md:text-lg">{t.home.cta.body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={APP_URL} data-cta="cta-try" className={buttonClass("primary", "md")}>
            {t.common.tryDemo}
            <IconArrowRight size={18} stroke={1.75} aria-hidden />
          </a>
          <a
            href={DEPLOY_URL}
            target="_blank"
            rel={externalRel(DEPLOY_URL)}
            data-cta="cta-deploy"
            className={buttonClass("secondary", "md")}
          >
            {t.common.deploy}
            <NewTabHint locale={locale} />
          </a>
        </div>
        <div className="mt-6">
          <TextLink href={REPO_URL} external>
            {t.common.viewOnGithub}
            <NewTabHint locale={locale} />
          </TextLink>
        </div>
      </div>

      <div aria-hidden className="mask-fade-y relative h-[420px] overflow-hidden rounded-2xl bg-white/60 p-3 md:h-[560px]">
        <div className="grid grid-cols-2 gap-3">
          {CTA_COLLAGE.map((column, index) => (
            <div key={index} className={cn("flex flex-col gap-3", index === 1 && "mt-12")}>
              {column.map((shot) => (
                <div key={shot} className="rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-black/5">
                  <Screenshot name={shot} locale={locale} alt="" className="rounded-lg" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default CtaSection
