import { IconBell, IconBrandGithub } from "@tabler/icons-react"
import { NewTabHint } from "@/components/site/external-mark"
import { APP_URL, WATCH_URL } from "@/content/site"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { buttonClass, CARD, CONTAINER } from "@/lib/styles"
import { cn } from "@/lib/cn"

export function ChangelogSubscribe({ locale }: { locale: Locale }) {
  const t = getMessages(locale)

  return (
    <section id="subscribe" className={cn(CONTAINER, "pb-20 md:pb-32")}>
      <div
        className={cn(
          CARD,
          "relative flex flex-col items-start gap-6 overflow-hidden p-8 md:flex-row md:items-center md:justify-between md:p-10",
        )}
      >
        {/* 左：图标 + 标题 + 说明 */}
        <div className="relative z-10 max-w-xl">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
            <IconBell size={20} stroke={1.75} aria-hidden />
          </span>
          <h2 className="mt-5 text-2xl tracking-tight text-neutral-800 md:text-3xl">{t.changelog.subscribe.title}</h2>
          <p className="mt-2 text-base text-neutral-600">{t.changelog.subscribe.body}</p>
        </div>

        {/* 右：两个按钮 */}
        <div className="relative z-10 flex flex-wrap gap-3">
          <a
            href={WATCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-cta="subscribe-watch"
            className={buttonClass("primary", "md")}
          >
            <IconBrandGithub size={18} stroke={1.75} aria-hidden />
            {t.changelog.watch}
            <NewTabHint locale={locale} />
          </a>
          <a href={APP_URL} className={buttonClass("secondary", "md")}>
            {t.common.tryDemo}
          </a>
        </div>

        {/* 右上角的蓝色柔光装饰 */}
        <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-56 rounded-full bg-brand-soft blur-3xl" />
      </div>
    </section>
  )
}

export default ChangelogSubscribe
